import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const CLICKSEND_USERNAME = process.env.CLICKSEND_USERNAME;
const CLICKSEND_API_KEY = process.env.CLICKSEND_API_KEY;
const BASE_URL = "https://rest.clicksend.com/v3";

if (!CLICKSEND_USERNAME || !CLICKSEND_API_KEY) {
  console.warn(
    "WARNING: missing ClickSend credentials - " +
    (!CLICKSEND_USERNAME ? "CLICKSEND_USERNAME " : "") +
    (!CLICKSEND_API_KEY ? "CLICKSEND_API_KEY " : "") +
    "not set. Set them in the Render service's Environment settings; tool calls to ClickSend will fail with 401 until they are."
  );
} else {
  console.log("ClickSend credentials loaded from environment (CLICKSEND_USERNAME set, CLICKSEND_API_KEY=***" + CLICKSEND_API_KEY.slice(-4) + ").");
}

function authHeader() {
return { Authorization: "Basic " + Buffer.from(CLICKSEND_USERNAME + ":" + CLICKSEND_API_KEY).toString("base64"), "Content-Type": "application/json" };
}

function getServer() {
const server = new McpServer({ name: "clicksend-mcp", version: "2.0.0" });

server.tool("list_contact_lists", "Get all ClickSend contact lists (groups), including their list_id, name, and contact count.", {}, async () => {
const resp = await fetch(BASE_URL + "/lists?limit=100", { headers: authHeader() });
const data = await resp.json();
if (!resp.ok) return { content: [{ type: "text", text: "Error: " + JSON.stringify(data) }], isError: true };
return { content: [{ type: "text", text: JSON.stringify(data.data && data.data.data ? data.data.data : data, null, 2) }] };
});

server.tool("list_contacts", "Get contacts and phone numbers from a specific contact list (group). Omit list_id to fetch contacts from every list (i.e. 'everyone').", { list_id: z.string().optional().describe("The list_id from list_contact_lists. Omit to get all contacts across all lists.") }, async ({ list_id }) => {
async function fetchListContacts(id) {
const resp = await fetch(BASE_URL + "/lists/" + id + "/contacts?limit=1000", { headers: authHeader() });
const data = await resp.json();
if (!resp.ok) throw new Error(JSON.stringify(data));
return data.data && data.data.data ? data.data.data : [];
}
try {
if (list_id) {
const contacts = await fetchListContacts(list_id);
return { content: [{ type: "text", text: JSON.stringify(contacts, null, 2) }] };
}
const listsResp = await fetch(BASE_URL + "/lists?limit=100", { headers: authHeader() });
const listsData = await listsResp.json();
if (!listsResp.ok) throw new Error(JSON.stringify(listsData));
const lists = listsData.data && listsData.data.data ? listsData.data.data : [];
const all = [];
for (const l of lists) {
const contacts = await fetchListContacts(l.list_id);
contacts.forEach((c) => all.push(Object.assign({}, c, { list_name: l.list_name })));
}
return { content: [{ type: "text", text: JSON.stringify(all, null, 2) }] };
} catch (err) {
return { content: [{ type: "text", text: "Error: " + err.message }], isError: true };
}
});

server.tool("get_received_messages", "Get SMS messages received on your ClickSend number(s), most recent first.", { limit: z.number().optional().describe("Max number of messages to return (default 20)") }, async ({ limit }) => {
const resp = await fetch(BASE_URL + "/sms/inbound?limit=" + (limit || 20), { headers: authHeader() });
const data = await resp.json();
if (!resp.ok) return { content: [{ type: "text", text: "Error: " + JSON.stringify(data) }], isError: true };
return { content: [{ type: "text", text: JSON.stringify(data.data && data.data.data ? data.data.data : data, null, 2) }] };
});

server.tool("send_sms", "Send an SMS to one or more recipients. IMPORTANT: only call this AFTER the user has explicitly reviewed and approved the exact message text and the exact recipient list/count in chat. Never send without that confirmation.", { to: z.array(z.string()).describe("Array of recipient phone numbers in E.164 format, e.g. ['+14155552671']. Use one number for a single contact, or multiple for a group/everyone."), message: z.string().describe("The approved text message body to send") }, async ({ to, message }) => {
const messages = to.map((number) => ({ to: number, body: message }));
const resp = await fetch(BASE_URL + "/sms/send", { method: "POST", headers: authHeader(), body: JSON.stringify({ messages: messages }) });
const data = await resp.json();
if (!resp.ok) return { content: [{ type: "text", text: "ClickSend error: " + JSON.stringify(data) }], isError: true };
return { content: [{ type: "text", text: "Sent to " + to.length + " recipient(s): " + JSON.stringify(data.data && data.data.messages ? data.data.messages : data) }] };
});

return server;
}

const app = express();
app.use(express.json());

app.use((req, res, next) => {
res.header("Access-Control-Allow-Origin", "*");
res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
res.header("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version");
res.header("Access-Control-Expose-Headers", "Mcp-Session-Id");
if (req.method === "OPTIONS") return res.sendStatus(204);
next();
});

app.post("/mcp", async (req, res) => {
try {
const server = getServer();
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
res.on("close", () => {
transport.close();
server.close();
});
await server.connect(transport);
await transport.handleRequest(req, res, req.body);
} catch (err) {
console.error("Error handling MCP request:", err);
if (!res.headersSent) {
res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
}
}
});

app.get("/mcp", (req, res) => {
res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
});

app.delete("/mcp", (req, res) => {
res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
});

app.get("/", (req, res) => res.send("ClickSend MCP server is running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("ClickSend MCP server listening on port " + PORT));
