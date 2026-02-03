# Security Guidelines

## Secrets Management

### DO:
- Store all secrets in Cloudflare environment variables
- Use `wrangler secret put` for Worker secrets
- Reference secrets via `env.SECRET_NAME` in code

### DON'T:
- Commit API keys, passwords, or tokens
- Store secrets in `.claude/settings.local.json`
- Hardcode credentials in source files

## Incident Response

### API Key Rotation Checklist:
1. Generate new key at provider
2. Update Cloudflare secrets immediately
3. Verify worker runs successfully
4. Revoke old key at provider
5. Document in git commit
