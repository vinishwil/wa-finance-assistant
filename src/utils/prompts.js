/**
 * AI Prompts for transaction extraction
 */

/**
 * Helper: Format categories for AI prompt
 */
function formatCategoriesForPrompt(categories) {
  if (!categories || categories.length === 0) {
    return 'Food, Transport, Shopping, Bills, Healthcare, Entertainment, Salary, Business, Other';
  }
  
  // Extract category names from the categories array
  return categories.map(cat => cat.name).join(', ');
}

/**
 * System prompt for image/OCR-based transaction extraction
 */
function getImageExtractionSystemPrompt(categories = []) {
  const categoryList = formatCategoriesForPrompt(categories);
  
  return `You are a financial transaction extraction assistant. Analyze the provided receipt or bill image and extract structured transaction information.

**IMPORTANT: If the image contains MULTIPLE transactions or line items, extract ALL of them as an array.**

Extract the following details for EACH transaction:
1. type: "credit" or "debit" (debit if it's an expense/payment, credit if it's income/refund)
2. amount: numerical value only, no currency symbols
3. currency: 3-letter currency code (INR, USD, EUR, etc.) - default to INR if not clear
4. date: transaction date in ISO format (YYYY-MM-DD) - ALWAYS use today's date (${new Date().toISOString().split('T')[0]}) unless a specific date is clearly mentioned in the message
5. category: MUST be EXACTLY one of these available categories: ${categoryList}
6. vendor: merchant/store name if visible
7. description: brief description of the transaction
8. raw_text: all text extracted from the image

**IMPORTANT CATEGORY MATCHING RULES:**
- ONLY use categories from the provided list above
- Match the EXACT category name from the list (case-insensitive)
- Common bill/receipt type mappings:
  * Electricity, water, gas bills, utilities, rent, house expenses -> use "House" if available
  * Restaurant, food delivery, groceries, swiggy, zomato -> use "Food & Dinning" if available
  * Fuel, parking, toll, uber, ola, transport -> use "Transportation" if available
  * Pharmacy, clinic, hospital, medical bills -> use "Health & Personal Care" if available
  * Movie tickets, games, entertainment -> use "Entertainment" if available
  * Clothing, accessories, shopping -> use "Shopping" if available
  * Salary slips, income -> use "Employment" if available
  * Pet care, vet bills -> use "Pets" if available
  * Education, books, courses -> use "Education" if available
  * Travel, flights, hotels -> use "Travel" if available
- If no good match exists, use "Other" or "Miscellaneous"

Rules:
- Always respond with valid JSON only
- If image contains multiple transactions, return an array of transaction objects
- If image contains single transaction, return an array with one transaction object
- If amount is not found, return null for the entire response
- Be conservative with categorization
- Extract GST/tax amounts separately if visible
- For bills, mark as "debit"
- For payment confirmations/refunds, mark as "credit"
- Category name MUST match one from the provided list exactly

Response format for SINGLE transaction:
[{
  "type": "debit",
  "amount": 450.50,
  "currency": "INR",
  "date": "2024-01-15",
  "category": "Food & Dinning",
  "vendor": "Swiggy",
  "description": "Food delivery",
  "raw_text": "Full OCR text here..."
}]`;
}

/**
 * System prompt for audio/text-based transaction extraction
 */
function getTextExtractionSystemPrompt(categories = []) {
  const categoryList = formatCategoriesForPrompt(categories);
  
  return `You are a financial transaction extraction assistant. Analyze the provided text (from voice transcription or direct text message) and extract structured transaction information.

**IMPORTANT: If the message contains MULTIPLE transactions, extract ALL of them as an array.**

Extract the following details for EACH transaction:
1. type: "credit" or "debit" (debit for expenses, credit for income)
2. amount: numerical value only
3. currency: 3-letter currency code - default to INR if not mentioned
4. date: transaction date in ISO format (YYYY-MM-DD) - ALWAYS use today's date (${new Date().toISOString().split('T')[0]}) unless a specific date is clearly mentioned in the message
5. category: MUST be EXACTLY one of these available categories: ${categoryList}
6. vendor: merchant/person name if mentioned
7. description: brief description
8. raw_text: original input text

**IMPORTANT CATEGORY MATCHING RULES:**
- ONLY use categories from the provided list above
- Match the EXACT category name from the list (case-insensitive)
- Common mappings:
  * "home expenses", "bills", "utilities", "electricity", "water", "gas", "rent", "house" -> use "House" if available
  * "groceries", "food", "restaurant", "food delivery", "swiggy", "zomato" -> use "Food & Dinning" if available
  * "car", "fuel", "transport", "uber", "ola", "petrol", "diesel" -> use "Transportation" if available
  * "medical", "doctor", "medicine", "pharmacy", "hospital", "clinic" -> use "Health & Personal Care" if available
  * "salary", "income from job", "payroll", "wage" -> use "Employment" if available
  * "shopping", "clothes", "amazon", "flipkart", "myntra" -> use "Shopping" if available
  * "entertainment", "movie", "netflix", "hotstar", "party" -> use "Entertainment" if available
  * "pets", "dog", "cat", "vet" -> use "Pets" if available
  * "education", "school", "college", "course", "book" -> use "Education" if available
  * "travel", "flight", "train", "bus", "hotel" -> use "Travel" if available
- If no good match exists, use "Other" or "Miscellaneous"

Examples:
- "I spent 500 rupees on groceries" -> [{"type": "debit", "amount": 500, "currency": "INR", "category": "Food & Dinning"}]
- "Received salary 50000" -> [{"type": "credit", "amount": 50000, "currency": "INR", "category": "Employment"}]
- "Paid 1200 for electricity bill" -> [{"type": "debit", "amount": 1200, "currency": "INR", "category": "House"}]
- "I spent 100000 on house repair and 400 for grocery" -> [{"type": "debit", "amount": 100000, "currency": "INR", "category": "House", "description": "house repair"}, {"type": "debit", "amount": 400, "currency": "INR", "category": "Food & Dinning", "description": "grocery"}]

Rules:
- Always respond with valid JSON only
- If message contains multiple transactions, return an array of transaction objects
- If message contains single transaction, return an array with one transaction object
- If amount is not found, return null for the entire response
- Handle multilingual input (Hindi, English, regional languages)
- Understand common phrases: "spent", "paid", "bought", "received", "got", etc.
- Convert word numbers to digits: "five hundred" -> 500, "lakh" -> 100000
- Category name MUST match one from the provided list exactly

Response format for SINGLE transaction:
[{
  "type": "debit",
  "amount": 500,
  "currency": "INR",
  "date": "2024-01-15",
  "category": "Food & Dinning",
  "vendor": null,
  "description": "Groceries",
  "raw_text": "Original user message..."
}]

Response format for MULTIPLE transactions:
[{
  "type": "debit",
  "amount": 100000,
  "currency": "INR",
  "date": "2024-01-15",
  "category": "House",
  "vendor": null,
  "description": "house repair",
  "raw_text": "I spent a lakh in house repair and 400 for grocery"
},
{
  "type": "debit",
  "amount": 400,
  "currency": "INR",
  "date": "2024-01-15",
  "category": "Food & Dinning",
  "vendor": null,
  "description": "grocery",
  "raw_text": "I spent a lakh in house repair and 400 for grocery"
}]`;
}

/**
 * User prompt template for image extraction
 */
function getImageExtractionPrompt(additionalContext = '') {
  return `Analyze this receipt/bill image and extract transaction details. ${additionalContext}`;
}

/**
 * User prompt template for text extraction
 */
function getTextExtractionPrompt(text, additionalContext = '') {
  return `Extract transaction details from this message: "${text}". ${additionalContext}`;
}

/**
 * Prompt for transaction confirmation message
 */
function getConfirmationMessage(transaction, userName = 'there') {
  const { type, amount, currency, category, date, description, vendor } = transaction;
  
  const emoji = type === 'credit' ? '💰' : '💸';
  const action = type === 'credit' ? 'Received' : 'Spent';
  
  let message = `${emoji} *Transaction Recorded*\n\n`;
  message += `${action}: *${currency} ${amount}*\n`;
  message += `Category: ${category}\n`;
  if (vendor) message += `Vendor: ${vendor}\n`;
  if (description) message += `Note: ${description}\n`;
  message += `Date: ${date}\n\n`;
  message += `✅ This has been saved to your finance tracker.\n\n`;
  message += `Reply with:\n`;
  message += `• "EDIT" to modify details\n`;
  message += `• "DELETE" to remove this entry\n`;
  message += `• "CATEGORY [name]" to change category`;
  
  return message;
}

/**
 * Prompt for onboarding/linking message
 */
function getLinkingInstructionsMessage() {
  return `👋 *Welcome to Finance Assistant!*\n\n` +
    `I couldn't find your account. Let's link your WhatsApp to your finance tracker.\n\n` +
    `Please reply with:\n` +
    `*LINK [your-email]*\n\n` +
    `Example: LINK john@example.com\n\n` +
    `You'll receive a verification code to complete the setup.`;
}

/**
 * Prompt for verification code message
 */
function getVerificationCodeMessage(code) {
  return `🔐 *Verification Code*\n\n` +
    `Your verification code is: *${code}*\n\n` +
    `This code will expire in 10 minutes.\n` +
    `Reply with: *VERIFY ${code}*`;
}

/**
 * Prompt for successful linking
 */
function getSuccessfulLinkMessage(userName) {
  return `✅ *Account Linked Successfully!*\n\n` +
    `Welcome, ${userName}! 🎉\n\n` +
    `You can now send me:\n` +
    `📸 Photos of bills/receipts\n` +
    `🎤 Voice notes about expenses\n` +
    `💬 Text messages with transaction details\n\n` +
    `I'll automatically track everything for you!`;
}

/**
 * Prompt for daily reminder
 */
function getDailyReminderMessage(userName = 'there') {
  return `☀️ *Good morning, ${userName}!*\n\n` +
    `📊 Did you have any expenses or income yesterday?\n\n` +
    `Send me:\n` +
    `• Photos of receipts\n` +
    `• Voice notes\n` +
    `• Text messages\n\n` +
    `Or reply "NONE" if you have nothing to record today.`;
}

/**
 * Prompt for extraction error
 */
function getExtractionErrorMessage() {
  return `❌ *Couldn't Extract Transaction*\n\n` +
    `I couldn't find transaction details in your message.\n\n` +
    `Please try:\n` +
    `• Sending a clearer photo\n` +
    `• Including amount and description\n` +
    `• Speaking clearly in voice notes\n\n` +
    `Example: "I spent 500 rupees on groceries"`;
}

/**
 * Prompt for subscription required
 */
function getSubscriptionRequiredMessage(userName = 'there') {
  return `🔒 *Premium Feature*\n\n` +
    `Hi ${userName},\n\n` +
    `This feature requires an active subscription.\n\n` +
    `Visit ${process.env.APP_BASE_URL}/subscribe to upgrade your plan.\n\n` +
    `Benefits:\n` +
    `✨ Unlimited transaction tracking\n` +
    `📊 Advanced analytics\n` +
    `🤖 AI-powered insights\n` +
    `☁️ Cloud backup`;
}

/**
 * Prompt for help/commands
 */
function getHelpMessage() {
  return `📖 *Finance Assistant Help*\n\n` +
    `*Basic Commands:*\n` +
    `• LINK [email] - Link your account\n` +
    `• VERIFY [code] - Verify your account\n` +
    `• DELETE - Delete last transaction\n` +
    `• HELP - Show this message\n\n` +
    `*Category Commands:*\n` +
    `• CATEGORIES - List all categories\n` +
    `• ADD CATEGORY [name] - Add custom category (Premium)\n\n` +
    `*How to Track:*\n` +
    `📸 Send photos of bills\n` +
    `🎤 Record voice notes\n` +
    `💬 Text your expenses\n\n` +
    `*Examples:*\n` +
    `"I paid 1200 for electricity"\n` +
    `"Spent ₹500 on groceries at Big Bazaar"\n` +
    `"Received salary 50000"\n\n` +
    `💡 If a category isn't found, it'll be saved as "Other" for you to review later.`;
}

module.exports = {
  // Legacy exports (for backward compatibility)
  IMAGE_EXTRACTION_SYSTEM_PROMPT: getImageExtractionSystemPrompt(),
  TEXT_EXTRACTION_SYSTEM_PROMPT: getTextExtractionSystemPrompt(),
  
  // New dynamic prompt generators
  getImageExtractionSystemPrompt,
  getTextExtractionSystemPrompt,
  formatCategoriesForPrompt,
  
  // Other prompts
  getImageExtractionPrompt,
  getTextExtractionPrompt,
  getConfirmationMessage,
  getLinkingInstructionsMessage,
  getVerificationCodeMessage,
  getSuccessfulLinkMessage,
  getDailyReminderMessage,
  getExtractionErrorMessage,
  getSubscriptionRequiredMessage,
  getHelpMessage,
};
