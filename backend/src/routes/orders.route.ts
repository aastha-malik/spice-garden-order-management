import { Hono } from 'hono';
import { invalidFilter, notFound } from '../lib/errors.js';
import { parsePagination } from '../lib/pagination.js';
import { ok, paginated } from '../lib/response.js';
import { bodyValidator, parsePathId, queryValidator } from '../lib/validation.js';
import { orderStatusSchema, uuidSchema } from '../schemas/common.schema.js';
import {
  createOrderSchema,
  listOrdersQuerySchema,
  orderItemInputSchema,
  updateOrderStatusSchema,
} from '../schemas/order.schema.js';
import * as service from '../services/order.service.js';

export const ordersRoute = new Hono()

  .get('/', queryValidator(listOrdersQuerySchema), async (c) => {
    const query = c.req.valid('query');
    const { page, size, offset } = parsePagination(query);

    // An unrecognised status is a bad filter, not an empty result set.
    let status;
    if (query.status) {
      const parsed = orderStatusSchema.safeParse(query.status);
      if (!parsed.success) {
        throw invalidFilter(
          `status must be one of ${orderStatusSchema.options.join(', ')}`,
        );
      }
      status = parsed.data;
    }

    // A customerId that is not even a UUID cannot match a stored customer,
    // so it reports the same RESOURCE_NOT_FOUND as an unknown one.
    let customerId: string | undefined;
    if (query.customerId) {
      const parsed = uuidSchema.safeParse(query.customerId);
      if (!parsed.success) throw notFound('Customer');
      customerId = parsed.data;
    }

    const { orders, total } = await service.listOrders({
      search: query.search,
      status,
      customerId,
      size,
      offset,
    });
    return c.json(paginated(orders, { page, size, total }));
  })

  .post('/', bodyValidator(createOrderSchema), async (c) => {
    const order = await service.createOrder(c.req.valid('json'));
    return c.json(ok(order), 201);
  })

  .get('/:orderId', async (c) => {
    const orderId = parsePathId(c.req.param('orderId'), 'Order');
    return c.json(ok(await service.getOrder(orderId)));
  })

  .patch('/:orderId/status', bodyValidator(updateOrderStatusSchema), async (c) => {
    const orderId = parsePathId(c.req.param('orderId'), 'Order');
    const { status } = c.req.valid('json');
    return c.json(ok(await service.updateStatus(orderId, status)));
  })

  .post('/:orderId/items', bodyValidator(orderItemInputSchema), async (c) => {
    const orderId = parsePathId(c.req.param('orderId'), 'Order');
    const order = await service.addItem(orderId, c.req.valid('json'));
    return c.json(ok(order), 201);
  })

  .delete('/:orderId/items/:itemId', async (c) => {
    const orderId = parsePathId(c.req.param('orderId'), 'Order');
    const itemId = parsePathId(c.req.param('itemId'), 'Order item');
    return c.json(ok(await service.removeItem(orderId, itemId)));
  });
