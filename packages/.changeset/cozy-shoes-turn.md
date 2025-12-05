---
'@mysten/messaging': patch
---

Add optional LogTape structured logging support

The Messaging SDK now includes structured logging using LogTape.
This is completely optional - install and configure LogTape in your application to enable logging.

Key features:

- Optional peer dependency
- Hierarchical logging categories
- Four log levels: debug, info, warning, error

For setup and configuration, see [loggin.md](./logging.md).
