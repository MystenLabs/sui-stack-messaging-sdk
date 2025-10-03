# Vendored: @mysten/sui-grpc

This package has been vendored (copied locally) to enable debugging and patching.

## Original Package Information

- **Package Name**: @mysten/sui-grpc
- **Original Version**: 0.2.0
- **Source Repository**: https://github.com/MystenLabs/sui (packages/sui-grpc)
- **NPM Package**: https://www.npmjs.com/package/@mysten/sui-grpc
- **Vendored Date**: 2025-10-03

## Reason for Vendoring

### Primary Issue: Missing `resolveTransactionPlugin` Implementation

The GRPC client's `resolveTransactionPlugin()` is not yet implemented, throwing error:
```
"GRPC client does not support transaction resolution yet"
```

This makes it impossible to use `Signer.signAndExecuteTransaction()` which internally calls `transaction.build()`, which requires the resolve plugin to:
- Resolve UnresolvedObject inputs to ObjectRefs
- Set gas price
- Set gas budget (via dry run)
- Select gas payment coins

**Impact**: Cannot execute transactions using the standard Signer API with GRPC clients.

### Secondary Issue: Direct `executeTransaction` Timeout

When attempting to bypass the resolver by manually building transactions and calling `grpcClient.transactionExecutionService.executeTransaction()` directly, the call hangs indefinitely.

**Upstream Issue**: [To be filed once root cause is identified]

## Modifications

All modifications will be marked with `// VENDORED PATCH:` comments in the code.

### Planned Changes
- [ ] Implement or fix resolveTransactionPlugin for GRPC
- [ ] Debug and fix executeTransaction timeout issue
- [ ] Add additional logging/debugging capabilities

### Applied Patches
_(Will be updated as changes are made)_

## Update Strategy

1. **Monitor upstream**: Check https://github.com/MystenLabs/sui for fixes
2. **File upstream issue**: Once root cause identified, file detailed issue with reproduction
3. **Un-vendor when fixed**: Remove vendored version once upstream fix is available
4. **Target timeline**: Remove vendoring within 2-4 weeks if possible

## Testing

The vendored package must pass all existing integration tests:
```bash
pnpm test:integration:testnet
```

## Maintenance Notes

- **Do not upgrade** other @mysten packages without checking compatibility
- **Track changes**: Use git to track all modifications to vendored code
- **Minimal patches**: Only modify what's absolutely necessary
- **Document everything**: Update this file with each change
