import handler from '../../../../lib/feed.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Preserve the foundation HTTP contract while adapting Node's response to Web Response.
async function feed(request: Request) {
  const headers = new Headers();
  let body: string | undefined;
  const response = {
    end(value: string) {
      body = value;
    },
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    statusCode: 200,
  };
  await handler({ method: request.method, url: request.url }, response);
  return new Response(request.method === 'HEAD' ? null : body, {
    headers,
    status: response.statusCode,
  });
}

export {
  feed as DELETE,
  feed as GET,
  feed as HEAD,
  feed as OPTIONS,
  feed as PATCH,
  feed as POST,
  feed as PUT,
};
