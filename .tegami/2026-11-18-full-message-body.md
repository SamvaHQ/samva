---
packages:
  "@samva/chat-adapter": patch
  "@samva/eve": patch
---

## Read the full body of long emails

Webhook payloads cap `message.text` at 32,000 characters. The Chat SDK adapter and the Eve channel now fetch the full message from the mailbox when a body reaches that length, so long emails reach the agent uncut. Shorter messages need no extra request.
