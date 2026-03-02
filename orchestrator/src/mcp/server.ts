import express from "express";
import { z } from "zod";
import { env } from "../config.js";
import { listExpenses, createExpense, updateExpense, deleteExpense } from "../tools/expenses-api.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const tools = [
  {
    name: "expenses.list",
    description: "Elenca tutte le spese.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "expenses.create",
    description: "Crea una spesa.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        date: { type: "string" },
        currency: { type: "string" },
        category: { type: "string" },
        description: { type: "string" }
      },
      required: ["amount", "date"],
      additionalProperties: false
    }
  },
  {
    name: "expenses.update",
    description: "Aggiorna una spesa esistente.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        patch: { type: "object" }
      },
      required: ["id", "patch"],
      additionalProperties: false
    }
  },
  {
    name: "expenses.delete",
    description: "Elimina una spesa.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false
    }
  }
];

const rpcSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.any().optional()
});

function ok(id: string | number, result: any) {
  return { jsonrpc: "2.0", id, result };
}

function err(id: string | number, message: string, code = -32000) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

app.post("/rpc", async (req, res) => {
  const parsed = rpcSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });
  }

  const { id, method, params } = parsed.data;

  try {
    if (method === "tools/list") {
      return res.json(ok(id, tools));
    }

    if (method === "tools/call") {
      const name = params?.name as string | undefined;
      const args = params?.arguments ?? {};
      if (!name) return res.json(err(id, "Missing tool name", -32602));

      if (name === "expenses.list") {
        const data = await listExpenses();
        return res.json(ok(id, { content: [{ type: "json", json: data }] }));
      }
      if (name === "expenses.create") {
        const data = await createExpense(args);
        return res.json(ok(id, { content: [{ type: "json", json: data }] }));
      }
      if (name === "expenses.update") {
        const data = await updateExpense(args.id, args.patch);
        return res.json(ok(id, { content: [{ type: "json", json: data }] }));
      }
      if (name === "expenses.delete") {
        const data = await deleteExpense(args.id);
        return res.json(ok(id, { content: [{ type: "json", json: data }] }));
      }

      return res.json(err(id, `Tool not found: ${name}`, -32601));
    }

    return res.json(err(id, `Method not found: ${method}`, -32601));
  } catch (e: any) {
    const msg = e?.message ?? "Internal error";
    return res.json(err(id, msg, -32000));
  }
});

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(env.MCP_PORT, () => {
  console.log(`MCP server listening on http://localhost:${env.MCP_PORT}/rpc`);
});
