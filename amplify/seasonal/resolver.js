import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return { operation: 'Invoke', payload: {
    field: ctx.info.fieldName, arguments: ctx.arguments, identity: ctx.identity,
  } };
}

export function response(ctx) {
  if (ctx.error) util.error('Season service unavailable', 'SERVICE_UNAVAILABLE');
  return ctx.result;
}
