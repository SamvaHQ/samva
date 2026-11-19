---
packages:
  "@samva/chat-adapter": patch
---

## Send a new conversation once per delivery

A post to an `openDM` conversation from inside a webhook handler now carries an idempotency key built from the delivery and the post's position, as replies already did. When Samva redelivers a webhook after a lost response, the handler's new-conversation posts return the saved receipt instead of sending again. Posts outside a webhook handler are unchanged.
