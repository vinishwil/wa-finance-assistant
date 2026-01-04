const { supabase } = require('../config/supabaseClient');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Get user by WhatsApp phone number
 * Returns user data with family_id from family_members relationship
 */
async function getUserByWhatsapp(whatsappNumber) {
  try {
    const { data, error } = await supabase
      .from('whatsapp_links')
      .select(`
        *,
        users (
          *,
          family_members!inner (
            family_id,
            role
          )
        )
      `)
      .eq('whatsapp_number', whatsappNumber)
      .eq('verified', true)
      .eq('users.family_members.is_deleted', false)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - user not found
        return null;
      }
      throw error;
    }

    // Flatten the structure to include family_id at user level
    if (data?.users) {
      const user = data.users;
      const familyMember = user.family_members?.[0];
      
      if (familyMember) {
        user.family_id = familyMember.family_id;
        user.role = familyMember.role;
      }
      
      return user;
    }

    return null;
  } catch (error) {
    logger.logError(error, { context: 'getUserByWhatsapp', whatsappNumber });
    throw error;
  }
}

/**
 * Get user by email
 */
async function getUserByEmail(email) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data || null;
  } catch (error) {
    logger.logError(error, { context: 'getUserByEmail', email });
    throw error;
  }
}

/**
 * Create WhatsApp link with verification code
 */
async function createWhatsappLink(userId, whatsappNumber, verificationCode) {
  try {
    // Check if link already exists
    const { data: existing } = await supabase
      .from('whatsapp_links')
      .select('*')
      .eq('whatsapp_number', whatsappNumber)
      .single();

    if (existing) {
      // Update existing link
      const { data, error } = await supabase
        .from('whatsapp_links')
        .update({
          user_id: userId,
          verification_code: verificationCode,
          verified: false,
          linked_at: new Date().toISOString(),
        })
        .eq('whatsapp_number', whatsappNumber)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Create new link
      const { data, error } = await supabase
        .from('whatsapp_links')
        .insert({
          id: uuidv4(),
          user_id: userId,
          whatsapp_number: whatsappNumber,
          verification_code: verificationCode,
          verified: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  } catch (error) {
    logger.logError(error, { context: 'createWhatsappLink', userId, whatsappNumber });
    throw error;
  }
}

/**
 * Verify WhatsApp link with code
 */
async function verifyWhatsappLink(whatsappNumber, verificationCode) {
  try {
    const { data, error } = await supabase
      .from('whatsapp_links')
      .update({ verified: true, verification_code: null })
      .eq('whatsapp_number', whatsappNumber)
      .eq('verification_code', verificationCode)
      .select(`
        *,
        users (*)
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Invalid code or number
      }
      throw error;
    }

    return data?.users || null;
  } catch (error) {
    logger.logError(error, { context: 'verifyWhatsappLink', whatsappNumber });
    throw error;
  }
}

/**
 * Check if user has active subscription
 */
async function checkSubscription(userId) {
  try {
    // Get user's family membership
    const { data: familyMember, error: memberError } = await supabase
      .from('family_members')
      .select(`
        family_member_id,
        families (
          subscription_type,
          subscription_status,
          subscription_start_date,
          subscription_end_date
        )
      `)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .single();

    if (memberError) {
      if (memberError.code === 'PGRST116') {
        // No family membership found
        return {
          hasSubscription: false,
          subscriptionType: 'free',
          subscriptionStatus: 'inactive',
          expiresAt: null,
        };
      }
      throw memberError;
    }

    // Get family subscription details
    const family = familyMember?.families;
    
    if (!family) {
      return {
        hasSubscription: false,
        subscriptionType: 'free',
        subscriptionStatus: 'inactive',
        expiresAt: null,
      };
    }

    // Check if subscription is active
    const isActive = 
      (family.subscription_status === 'active' || family.subscription_status === 'will_expire') &&
      (family.subscription_type === 'free_trial' || family.subscription_type === 'premium' || family.subscription_type === 'enterprise') &&
      (!family.subscription_end_date || new Date(family.subscription_end_date) > new Date());

    return {
      hasSubscription: isActive,
      subscriptionType: family.subscription_type,
      subscriptionStatus: family.subscription_status,
      expiresAt: family.subscription_end_date,
    };
  } catch (error) {
    logger.logError(error, { context: 'checkSubscription', userId });
    // Default to free tier on error
    return { 
      hasSubscription: false, 
      subscriptionType: 'free', 
      subscriptionStatus: 'inactive',
      expiresAt: null 
    };
  }
}

/**
 * Insert transaction into database
 */
async function insertTransaction(transactionData) {
  try {
    const transaction = {
      transaction_id: uuidv4(),
      family_id: transactionData.family_id,
      user_id: transactionData.user_id,
      amount: transactionData.amount,
      type: transactionData.type,
      description: transactionData.description,
      transaction_date: transactionData.date,
      category_id: transactionData.category_id || null,
      wallet_id: transactionData.wallet_id || null,
      recipient_id: transactionData.recipient_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: transactionData.user_id,
      updated_by: transactionData.user_id,
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert(transaction)
      .select()
      .single();

    if (error) throw error;

    logger.info('Transaction inserted successfully', { transaction_id: data.transaction_id });
    return data;
  } catch (error) {
    logger.logError(error, { context: 'insertTransaction', transactionData });
    throw error;
  }
}

/**
 * Get categories for a family from categories table
 * Returns both default and custom categories that are not deleted
 * Combines default_categories and family-specific custom categories
 */
async function getCategoriesForFamily(familyId) {
  try {
    // Get default categories
    const { data: defaultCategories, error: defaultError } = await supabase
      .from('default_categories')
      .select(`
        category_id:default_category_id,
        name,
        type,
        icon,
        color,
        emoji
      `)
      .order('name', { ascending: true });

    if (defaultError) throw defaultError;

    // Get custom categories for this family
    const { data: customCategories, error: customError } = await supabase
      .from('categories')
      .select('category_id, name, type, icon, color, emoji')
      .eq('family_id', familyId)
      .eq('is_deleted', false)
      .is('default_category_id', null) // Only custom categories
      .order('name', { ascending: true });

    if (customError) throw customError;

    // Combine both lists
    const allCategories = [
      ...(defaultCategories || []),
      ...(customCategories || [])
    ];
    
    return allCategories;
  } catch (error) {
    logger.logError(error, { context: 'getCategoriesForFamily', familyId });
    return [];
  }
}

/**
 * Find category ID by name in family's categories
 * Searches both default_categories and custom categories
 */
async function findCategoryIdByName(categoryName, familyId) {
  try {
    // First, search in default categories
    const { data: defaultCategory, error: defaultError } = await supabase
      .from('default_categories')
      .select('default_category_id:category_id')
      .ilike('name', categoryName)
      .single();
    
    if (!defaultError && defaultCategory) {
      return defaultCategory.category_id;
    }

    // If not found in defaults, search in custom categories
    const { data: customCategory, error: customError } = await supabase
      .from('categories')
      .select('category_id')
      .eq('family_id', familyId)
      .ilike('name', categoryName)
      .eq('is_deleted', false)
      .is('default_category_id', null)
      .single();
    
    if (!customError && customCategory) {
      return customCategory.category_id;
    }
    
    return null;
  } catch (error) {
    logger.logError(error, { context: 'findCategoryIdByName', categoryName, familyId });
    return null;
  }
}

/**
 * Add category to family (creates new custom category)
 */
async function addCategoryToFamily(familyId, categoryName, categoryType = 'expense', icon = '📁', color = null, emoji = null) {
  try {
    // Check if category already exists
    const existingId = await findCategoryIdByName(categoryName, familyId);
    if (existingId) {
      return existingId;
    }
    
    // Create new custom category
    const newCategory = {
      category_id: uuidv4(),
      family_id: familyId,
      default_category_id: null,  // NULL = custom category
      name: categoryName,
      type: categoryType,
      icon: icon,
      color: color,
      emoji: emoji || determineCategoryIcon(categoryName),
      created_at: new Date().toISOString(),
    };
    
    const { data, error } = await supabase
      .from('categories')
      .insert(newCategory)
      .select()
      .single();
    
    if (error) throw error;
    
    logger.info('Custom category added to family', { 
      familyId, 
      categoryName, 
      categoryId: data.category_id 
    });
    
    return data.category_id;
  } catch (error) {
    logger.logError(error, { context: 'addCategoryToFamily', categoryName, familyId });
    return null;
  }
}

/**
 * Initialize default categories for a new family
 * Copies all default_categories to the family's categories table
 */
async function initializeDefaultCategoriesForFamily(familyId) {
  try {
    // Get all default categories
    const { data: defaultCategories, error: fetchError } = await supabase
      .from('default_categories')
      .select('*');
    
    if (fetchError) throw fetchError;
    
    if (!defaultCategories || defaultCategories.length === 0) {
      logger.warn('No default categories found to initialize', { familyId });
      return false;
    }
    
    // Create family-specific instances of default categories
    const familyCategories = defaultCategories.map(dc => ({
      category_id: uuidv4(),
      family_id: familyId,
      default_category_id: dc.default_category_id,
      name: dc.name,
      type: dc.type,
      icon: dc.icon,
      color: dc.color,
      emoji: dc.emoji,
      created_at: new Date().toISOString(),
    }));
    
    const { error: insertError } = await supabase
      .from('categories')
      .insert(familyCategories);
    
    if (insertError) throw insertError;
    
    logger.info('Default categories initialized for family', { 
      familyId, 
      count: familyCategories.length 
    });
    
    return true;
  } catch (error) {
    logger.logError(error, { context: 'initializeDefaultCategoriesForFamily', familyId });
    return false;
  }
}

/**
 * Get category by name with fuzzy matching (does NOT auto-create)
 * Uses provided categories list to avoid duplicate fetching
 * Returns category_id or null if not found
 * 
 * @param {string} categoryName - The category name to search for
 * @param {Array} availableCategories - Pre-fetched list of categories
 * @returns {string|null} - category_id or null
 */
function getCategoryByName(categoryName, availableCategories) {
  try {
    if (!availableCategories || availableCategories.length === 0) {
      logger.warn('No categories provided to getCategoryByName');
      return null;
    }

    const requested = categoryName.toLowerCase().trim();

    // Try exact match first (case-insensitive)
    const exactMatch = availableCategories.find(cat => 
      cat.name.toLowerCase() === requested
    );
    
    if (exactMatch) {
      return exactMatch.category_id;
    }

    // If no exact match, try fuzzy matching
    const matchedCategory = fuzzyMatchCategory(categoryName, availableCategories);
    
    if (matchedCategory) {
      logger.info('Fuzzy matched category', { 
        requested: categoryName, 
        matched: matchedCategory.name 
      });
      return matchedCategory.category_id;
    }

    // If still no match, try to find "Other" category as fallback
    const otherCategory = availableCategories.find(cat => 
      cat.name.toLowerCase() === 'other' && cat.type === 'expense'
    );

    if (otherCategory) {
      logger.info('Category not found, mapped to Other', { 
        requested: categoryName 
      });
      return otherCategory.category_id;
    }

    return null;
  } catch (error) {
    logger.logError(error, { context: 'getCategoryByName', categoryName });
    return null;
  }
}

/**
 * Fuzzy match category name to available categories
 * Uses keyword matching and similarity scoring
 */
function fuzzyMatchCategory(requestedCategory, availableCategories) {
  const requested = requestedCategory.toLowerCase().trim();
  
  // Category keyword mappings for common variations
  const categoryMappings = {
    'bills': ['house', 'utilities', 'bill'],
    'home': ['house'],
    'house': ['home', 'bills'],
    'groceries': ['food', 'food & dinning'],
    'food': ['food & dinning', 'groceries'],
    'dining': ['food & dinning', 'food'],
    'restaurant': ['food & dinning', 'entertainment'],
    'transport': ['transportation'],
    'car': ['transportation'],
    'fuel': ['transportation'],
    'gas': ['transportation'],
    'medical': ['health & personal care'],
    'health': ['health & personal care'],
    'doctor': ['health & personal care'],
    'medicine': ['health & personal care'],
    'movies': ['entertainment'],
    'game': ['entertainment'],
    'gym': ['health & personal care'],
    'salary': ['employment'],
    'income': ['employment', 'other'],
    'investment': ['investment'],
    'rent': ['rental', 'house'],
    'rental': ['rent'],
    'education': ['education'],
    'school': ['education'],
    'kids': ['child care'],
    'children': ['child care'],
    'baby': ['child care'],
    'pet': ['pets'],
    'dog': ['pets'],
    'cat': ['pets'],
    'shopping': ['shopping'],
    'clothes': ['shopping'],
    'travel': ['travel'],
    'trip': ['travel'],
    'vacation': ['travel'],
    'flight': ['travel'],
    'business': ['business'],
  };

  // Check if requested category matches any keywords
  for (const [keyword, targetCategories] of Object.entries(categoryMappings)) {
    if (requested.includes(keyword)) {
      // Find matching category in available categories
      for (const targetName of targetCategories) {
        const found = availableCategories.find(cat => 
          cat.name.toLowerCase().includes(targetName.toLowerCase())
        );
        if (found) {
          return found;
        }
      }
    }
  }

  // Fallback: Check if any available category name is contained in requested
  const partialMatch = availableCategories.find(cat => {
    const catName = cat.name.toLowerCase();
    return requested.includes(catName) || catName.includes(requested);
  });

  return partialMatch || null;
}

/**
 * Soft delete a category
 */
async function softDeleteCategory(categoryId, familyId, userId) {
  try {
    const { data, error } = await supabase
      .from('categories')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
      })
      .eq('category_id', categoryId)
      .eq('family_id', familyId)
      .select()
      .single();
    
    if (error) throw error;
    
    logger.info('Category soft deleted', { categoryId, familyId, userId });
    return data;
  } catch (error) {
    logger.logError(error, { context: 'softDeleteCategory', categoryId, familyId });
    return null;
  }
}

/**
 * Helper: Determine category type based on name
 */
function determineCategoryType(categoryName) {
  const incomeCategories = ['salary', 'income', 'business income', 'investment', 'bonus', 'refund'];
  return incomeCategories.some(inc => categoryName.toLowerCase().includes(inc)) 
    ? 'income' 
    : 'expense';
}

/**
 * Helper: Determine category icon based on name
 */
function determineCategoryIcon(categoryName) {
  const iconMap = {
    food: '🍔',
    transport: '🚗',
    shopping: '🛒',
    bills: '📝',
    healthcare: '⚕️',
    entertainment: '🎬',
    salary: '💰',
    business: '💼',
    education: '📚',
    rent: '🏠',
    groceries: '🛒',
    fuel: '⛽',
    utilities: '💡',
    insurance: '🛡️',
    investment: '📈',
  };
  
  const lowerName = categoryName.toLowerCase();
  for (const [key, icon] of Object.entries(iconMap)) {
    if (lowerName.includes(key)) {
      return icon;
    }
  }
  
  return '📁'; // Default icon
}

/**
 * Log event for debugging and analytics
 */
async function logEvent(eventType, payload) {
  try {
    const { error } = await supabase
      .from('event_logs')
      .insert({
        id: uuidv4(),
        event_type: eventType,
        payload: payload,
        created_at: new Date().toISOString(),
      });

    if (error) {
      logger.warn('Failed to log event', { eventType, error: error.message });
    }
  } catch (error) {
    // Don't throw - logging failures shouldn't break the main flow
    logger.warn('Failed to log event', { eventType, error: error.message });
  }
}

/**
 * Get user's last transaction
 */
async function getLastTransaction(userId) {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data || null;
  } catch (error) {
    logger.logError(error, { context: 'getLastTransaction', userId });
    return null;
  }
}

/**
 * Delete transaction
 */
async function deleteTransaction(transactionId, userId) {
  try {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('transaction_id', transactionId)
      .eq('user_id', userId);

    if (error) throw error;

    logger.info('Transaction deleted', { transactionId, userId });
    return true;
  } catch (error) {
    logger.logError(error, { context: 'deleteTransaction', transactionId, userId });
    throw error;
  }
}

/**
 * Update transaction
 */
async function updateTransaction(transactionId, userId, updates) {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq('transaction_id', transactionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    logger.info('Transaction updated', { transactionId, userId });
    return data;
  } catch (error) {
    logger.logError(error, { context: 'updateTransaction', transactionId, userId });
    throw error;
  }
}

/**
 * Get user statistics
 */
async function getUserStats(userId, startDate, endDate) {
  try {
    const { data, error } = await supabase
      .rpc('get_user_transaction_stats', {
        p_user_id: userId,
        p_start_date: startDate,
        p_end_date: endDate,
      });

    if (error) throw error;
    return data;
  } catch (error) {
    logger.logError(error, { context: 'getUserStats', userId });
    return null;
  }
}

/**
 * Get all users with active WhatsApp links (for daily reminders)
 */
async function getActiveWhatsappUsers() {
  try {
    const { data, error } = await supabase
      .from('whatsapp_links')
      .select(`
        whatsapp_number,
        users (user_id, full_name, family_id)
      `)
      .eq('verified', true);

    if (error) throw error;

    return data || [];
  } catch (error) {
    logger.logError(error, { context: 'getActiveWhatsappUsers' });
    return [];
  }
}

module.exports = {
  getUserByWhatsapp,
  getUserByEmail,
  createWhatsappLink,
  verifyWhatsappLink,
  checkSubscription,
  insertTransaction,
  getCategoryByName,
  getCategoriesForFamily,
  findCategoryIdByName,
  addCategoryToFamily,
  initializeDefaultCategoriesForFamily,
  softDeleteCategory,
  logEvent,
  getLastTransaction,
  deleteTransaction,
  updateTransaction,
  getUserStats,
  getActiveWhatsappUsers,
};
