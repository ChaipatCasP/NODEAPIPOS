const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Node API POS',
      version: '1.0.0',
      description: 'REST API สำหรับระบบ Point of Sale (POS) เชื่อมต่อกับ MySQL database: demo',
    },
    servers: [
      {
        url: `http://localhost:${process.env.APP_PORT || 3000}`,
        description: 'Local server',
      },
    ],
    tags: [
      { name: 'Auth', description: 'Login / Register / Profile' },
      { name: 'Products', description: 'จัดการสินค้า' },
      { name: 'Orders', description: 'จัดการคำสั่งซื้อ' },
      { name: 'Tables', description: 'จัดการโต๊ะ' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Product: {
          type: 'object',
          properties: {
            product_id: { type: 'integer', example: 1 },
            code: { type: 'string', example: 'P001' },
            name_en: { type: 'string', example: 'Crab Fried Rice' },
            name_th: { type: 'string', example: 'ข้าวผัดปู' },
            price: { type: 'number', format: 'float', example: 120.00 },
            picture: { type: 'string', example: 'crab_fried_rice.jpg' },
            product_status: { type: 'string', example: 'Available' },
          },
        },
        ProductInput: {
          type: 'object',
          required: ['code', 'name_th', 'price'],
          properties: {
            code: { type: 'string', example: 'P001' },
            name_en: { type: 'string', example: 'Crab Fried Rice' },
            name_th: { type: 'string', example: 'ข้าวผัดปู' },
            price: { type: 'number', format: 'float', example: 120.00 },
            picture: { type: 'string', example: 'crab_fried_rice.jpg' },
            product_status: { type: 'string', example: 'Available' },
          },
        },
        OrderHeader: {
          type: 'object',
          properties: {
            order_header_id: { type: 'integer', example: 1 },
            customer_name: { type: 'string', example: 'สมชาย ใจดี' },
            customer_tel: { type: 'string', example: '0812345678' },
            table_info_id: { type: 'integer', example: 2 },
            open_by: { type: 'string', example: 'staff01' },
            open_date: { type: 'string', format: 'date-time' },
            close_by: { type: 'string', example: 'staff01' },
            close_date: { type: 'string', format: 'date-time' },
            table_name: { type: 'string', example: 'โต๊ะ A1' },
            total_items: { type: 'integer', example: 3 },
            total_amount: { type: 'number', example: 490.00 },
          },
        },
        OrderInput: {
          type: 'object',
          required: ['items'],
          properties: {
            customer_name: { type: 'string', example: 'สมชาย ใจดี' },
            customer_tel: { type: 'string', example: '0812345678' },
            table_info_id: { type: 'integer', example: 2 },
            open_by: { type: 'string', example: 'staff01' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['product_id'],
                properties: {
                  product_id: { type: 'integer', example: 1 },
                },
              },
            },
          },
        },
        TableInfo: {
          type: 'object',
          properties: {
            table_info_id: { type: 'integer', example: 1 },
            code: { type: 'string', example: 'T01' },
            name_en: { type: 'string', example: 'Table A1' },
            name_th: { type: 'string', example: 'โต๊ะ A1' },
            total_sit: { type: 'integer', example: 4 },
            picture: { type: 'string', example: 'table_a1.jpg' },
            table_status: { type: 'string', example: 'available' },
          },
        },
        TableInput: {
          type: 'object',
          required: ['code', 'name_th'],
          properties: {
            code: { type: 'string', example: 'T01' },
            name_en: { type: 'string', example: 'Table A1' },
            name_th: { type: 'string', example: 'โต๊ะ A1' },
            total_sit: { type: 'integer', example: 4 },
            picture: { type: 'string', example: 'table_a1.jpg' },
            table_status: { type: 'string', example: 'available' },
          },
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'ดำเนินการสำเร็จ' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'เกิดข้อผิดพลาด' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
