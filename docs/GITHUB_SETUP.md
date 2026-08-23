# GitHub Repository — SearchFly (Monolithic Version)

**Repository:** https://github.com/marcelo-linhares/Search-Flight-Monolithic  
**Owner:** marcelo-linhares  
**Default branch:** `main`  
**Active experiment branch:** `context/billing-ledger`  

## Branch convention

| Branch | Purpose |
|--------|---------|
| `main` | Stable baseline |
| `develop` | Integration branch |
| `context/billing-ledger` | Billing bounded context work |
| `context/search-orchestrator` | Search orchestrator bounded context |

## Setup notes

- Remote configured via HTTPS
- Git identity: `Marcelo Linhares <mlinharesdev@gmail.com>`
- Always open terminal as **regular user** (not Administrator) to avoid `.git` ownership issues
- If push is rejected due to diverged history on a personal branch, use `git push --force-with-lease`
