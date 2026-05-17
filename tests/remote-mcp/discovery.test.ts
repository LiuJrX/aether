import test from "node:test"
import assert from "node:assert/strict"
import http from "node:http"

import { discoverRemoteMcpTools } from "../../extensions/remote-mcp/discovery.js"
import { buildPiTools } from "../../extensions/remote-mcp/pi-tools.js"
import { RemoteMcpClient } from "../../extensions/remote-mcp/client.js"
import type { RemoteMcpServerConfig } from "../../extensions/remote-mcp/types.js"

function createJsonRpcServer(
  handler: (
    body: Record<string, unknown>,
    req: http.IncomingMessage
  ) => {
    status?: number
    headers?: Record<string, string>
    body: unknown
  }
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on("data", (chunk) => chunks.push(chunk))
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
          string,
          unknown
        >
        const result = handler(body, req)
        res.statusCode = result.status ?? 200
        for (const [key, value] of Object.entries(result.headers ?? {})) {
          res.setHeader(key, value)
        }
        if (!res.hasHeader("content-type")) {
          res.setHeader("content-type", "application/json")
        }
        if (typeof result.body === "string") {
          res.end(result.body)
          return
        }

        res.end(JSON.stringify(result.body))
      })
    })

    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        throw new Error("Unable to bind test server")
      }

      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error)
                return
              }

              closeResolve()
            })
          }),
      })
    })
  })
}

test("discovery keeps only readonly GitHub tools when readonly mode is enabled", async () => {
  const requests: Array<{ headers: http.IncomingHttpHeaders; body: Record<string, unknown> }> = []

  const server = await createJsonRpcServer((body, req) => {
    requests.push({ headers: req.headers, body })

    if (body.method === "initialize") {
      return {
        headers: {
          "mcp-session-id": "session-123",
          "content-type": "text/event-stream",
        } as Record<string, string>,
        body: `event: message\ndata: ${JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: { protocolVersion: "2025-03-26" },
        })}\n\n`,
      }
    }

    if (body.method === "notifications/initialized") {
      return { headers: {} as Record<string, string>, body: {} }
    }

    if (body.method === "tools/list") {
      return {
        headers: {
          "content-type": "text/event-stream",
        } as Record<string, string>,
        body: `event: message\ndata: ${JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [
              {
                name: "readonly_tool",
                description: "safe",
                inputSchema: { type: "object", properties: {} },
                annotations: { readOnlyHint: true, title: "Readonly" },
              },
              {
                name: "write_tool",
                description: "unsafe",
                inputSchema: { type: "object", properties: {} },
                annotations: { readOnlyHint: false, title: "Write" },
              },
            ],
          },
        })}\n\n`,
      }
    }

    throw new Error(`Unexpected method: ${String(body.method)}`)
  })

  try {
    const configs: RemoteMcpServerConfig[] = [
      {
        name: "github",
        url: server.url,
        authMode: "pat",
        authValue: "ghp_test",
        readonly: true,
        protocol: "sse",
        toolPrefix: "mcp.github",
      },
    ]

    const discovery = await discoverRemoteMcpTools(configs)

    assert.deepEqual(
      discovery.tools.map((tool) => tool.namespacedName),
      ["mcp.github.readonly_tool"]
    )
    assert.equal(requests[0]?.headers.authorization, "Bearer ghp_test")
    assert.equal(requests[1]?.headers["mcp-session-id"], "session-123")
    assert.equal(requests[1]?.headers["x-mcp-readonly"], "true")
  } finally {
    await server.close()
  }
})

test("pi tool adapter calls back into remote MCP client", async () => {
  const server = await createJsonRpcServer((body) => {
    if (body.method === "initialize") {
      return {
        body: {
          jsonrpc: "2.0",
          id: body.id,
          result: { protocolVersion: "2025-03-26" },
        },
      }
    }

    if (body.method === "tools/call") {
      return {
        body: {
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{ type: "text", text: "remote ok" }],
          },
        },
      }
    }

    throw new Error(`Unexpected method: ${String(body.method)}`)
  })

  try {
    const client = new RemoteMcpClient({
      name: "serpapi",
      url: server.url,
      authMode: "path",
      authValue: "serp-key",
      readonly: true,
      protocol: "json",
      toolPrefix: "mcp.serpapi",
    })

    const tools = buildPiTools(
      [
        {
          serverName: "serpapi",
          namespacedName: "mcp.serpapi.search",
          originalName: "search",
          description: "search",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      new Map([["serpapi", client]])
    )

    const result = await tools[0]?.execute(
      "call-1",
      { q: "OpenAI" },
      undefined,
      undefined,
      {} as never
    )

    assert.deepEqual(result?.content, [{ type: "text", text: "remote ok" }])
  } finally {
    await server.close()
  }
})
