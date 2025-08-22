# ENVELOPE ENCRYPTION

**Create Channel Flow**

> --> Client Creates a new Channel\
> --> Client Generates Channel Key\
> --> Client Encrypts Channel Key with Seal\
> --> Client Stores Encrypted Channel Key on-chain under the Channel object

**Send Message Flow**

> --> Client Retrieves Encrypted Channel Key from chain\
> --> Client Decrypts Channel Key with Seal\
> --> Client Uses Channel Key to Encrypt Message and Attachments\
> --> Client Sends the Encrypted Message to the Channel

**Receive Message Flow**

> --> Client Retrieves Encrypted Message(s) from Channel\
> --> Client Decrypts Channel Key with Seal\
> --> Client Uses Channel Key to Decrypt Message and Attachments

## Encryption Algorithms

- **Channel Key**: AES-GCM (256 bits)

## Future Enhancements

- **Seperate Derived Key for Attachment Encryption**:
  Currently, the same channel key is used for both message and attachment encryption.
  In the future, we may derive a separate key specifically for attachments.
  We can use **HKDF** for this purpose.
