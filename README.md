# ClickSend MCP Server

A remote MCP (Model Context Protocol) server that lets Claude read, organize, and send SMS messages through your ClickSend account.

## Setup
1. Set environment variables CLICKSEND_USERNAME and CLICKSEND_API_KEY with your ClickSend credentials.
2. Install dependencies: npm install
3. Start the server: npm start

## Usage
Connect Claude via Settings > Connectors > Add custom connector, using https://your-deployed-url/mcp as the Remote MCP server URL.

## Tools
- list_contact_lists - view your ClickSend contact groups/lists.
- list_contacts - view contacts/numbers in a specific group, or across all groups ("everyone").
- get_received_messages - read incoming SMS replies.
- send_sms - send a message to one number, a group's numbers, or everyone. Claude will always show you the drafted message and recipient list for your approval before sending.

## Workflow
Ask Claude to check messages, pull a contact list, or draft an SMS to a group. Claude will show you the exact text and recipient count and wait for your explicit "send it" before anything goes out.
