import { Hono } from 'hono';
import { parsePagination } from '../lib/pagination.js';
import { ok, paginated } from '../lib/response.js';
import { bodyValidator, parsePathId, queryValidator } from '../lib/validation.js';
import { paginationQuerySchema } from '../schemas/common.schema.js';
import { createCustomerSchema, updateCustomerSchema } from '../schemas/customer.schema.js';
import * as service from '../services/customer.service.js';

export const customersRoute = new Hono()

  .get('/', queryValidator(paginationQuerySchema), async (c) => {
    const query = c.req.valid('query');
    const { page, size, offset } = parsePagination(query);
    const { customers, total } = await service.listCustomers({
      search: query.search,
      page,
      size,
      offset,
    });
    return c.json(paginated(customers, { page, size, total }));
  })

  .post('/', bodyValidator(createCustomerSchema), async (c) => {
    const customer = await service.createCustomer(c.req.valid('json'));
    return c.json(ok(customer), 201);
  })

  .patch('/:id', bodyValidator(updateCustomerSchema), async (c) => {
    const id = parsePathId(c.req.param('id'), 'Customer');
    const customer = await service.updateCustomer(id, c.req.valid('json'));
    return c.json(ok(customer));
  })

  .delete('/:id', async (c) => {
    const id = parsePathId(c.req.param('id'), 'Customer');
    await service.deleteCustomer(id);
    return c.body(null, 204);
  });
