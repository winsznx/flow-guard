# FlowGuard API Documentation

API documentation will be added here as the backend is developed.

## Endpoints

### Vault Management
- `POST /api/vaults` - Create vault
- `GET /api/vaults/:id` - Get vault details
- `GET /api/vaults` - List user's vaults
- `GET /api/vaults/:id/state` - Get vault state

### Proposals
- `POST /api/vaults/:id/proposals` - Create proposal
- `GET /api/vaults/:id/proposals` - List proposals
- `POST /api/proposals/:id/approve` - Approve proposal
- `GET /api/proposals/:id` - Get proposal details

### Cycles
- `GET /api/vaults/:id/cycles` - Get cycle history
- `GET /api/vaults/:id/cycles/current` - Get current cycle
- `POST /api/vaults/:id/unlock` - Trigger unlock (if needed)

