const request = require('supertest');
const app = require('../../index');

describe('Application Health', () => {
  it('should return 200 on root endpoint', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('running');
  });

  it('should return 404 for unknown routes', async () => {
    const response = await request(app).get('/unknown-route');
    expect(response.status).toBe(404);
  });
});

describe('WhatsApp Webhook', () => {
  it('should verify webhook with correct token', async () => {
    const response = await request(app)
      .get('/webhook/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': process.env.WHATSAPP_VERIFY_TOKEN,
        'hub.challenge': 'test-challenge',
      });
    
    expect(response.status).toBe(200);
    expect(response.text).toBe('test-challenge');
  });

  it('should reject webhook with incorrect token', async () => {
    const response = await request(app)
      .get('/webhook/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': 'test-challenge',
      });
    
    expect(response.status).toBe(403);
  });

  it('should accept POST requests to webhook', async () => {
    const mockPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'test-id',
        changes: [],
      }],
    };

    const response = await request(app)
      .post('/webhook/whatsapp')
      .send(mockPayload);
    
    expect(response.status).toBe(200);
  });
});

describe('Admin Routes', () => {
  it('should return health status', async () => {
    const response = await request(app).get('/admin/health');
    expect(response.status).toBeIn([200, 503]);
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('services');
  });

  it('should require API key for protected routes', async () => {
    const response = await request(app).get('/admin/stats');
    expect(response.status).toBe(401);
  });

  it('should allow access with valid API key', async () => {
    process.env.ADMIN_API_KEY = 'test-api-key';
    
    const response = await request(app)
      .get('/admin/stats')
      .set('x-api-key', 'test-api-key');
    
    expect(response.status).toBeIn([200, 500]); // 500 if DB not configured
  });
});
