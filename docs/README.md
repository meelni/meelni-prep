# Meelni Documentation

Welcome to the Meelni project documentation. This is your central hub for all technical documentation, guides, and references.

## Quick Links

- **[Getting Started](#)** - Setup guide for new developers
- **[API Documentation](./api/README.md)** - REST API specifications and examples
- **[Architecture Decisions](./architecture/adrs/README.md)** - ADRs documenting key decisions
- **[Deployment Guide](./deployment/README.md)** - Production deployment instructions
- **[Troubleshooting](./.claude/TROUBLESHOOTING.md)** - Common issues and solutions

## Documentation Structure

### Core Documentation (`.claude/`)

These files form the "living operational document" for the project:

- **[CLAUDE.md](../.claude/CLAUDE.md)** - Main operational document (single source of truth)
- **[PRD.md](../.claude/PRD.md)** - Product requirements and specifications
- **[CONTRIBUTING.md](../.claude/CONTRIBUTING.md)** - Contributing guidelines and standards
- **[LIVEKIT.md](../.claude/LIVEKIT.md)** - LiveKit integration patterns
- **[DATABASE.md](../.claude/DATABASE.md)** - Database schema reference
- **[TROUBLESHOOTING.md](../.claude/TROUBLESHOOTING.md)** - Common issues and fixes
- **[DEPLOYMENT.md](../.claude/DEPLOYMENT.md)** - High-level deployment overview

### Technical Documentation (`docs/`)

#### [Architecture](./architecture/)
- **[ADRs](./architecture/adrs/README.md)** - Architecture Decision Records
- System design diagrams (coming soon)
- Data flow documentation (coming soon)

#### [API Documentation](./api/)
- REST API specifications
- Authentication flows
- Endpoint examples and curl scripts
- OpenAPI specification

#### [Development](./development/)
- Setup guides
- Testing documentation
- Debugging workflows
- Development standards

#### [Deployment](./deployment/)
- Vercel deployment guide
- LiveKit agent deployment
- Environment variables reference
- Quickstart checklist

#### [Features](./features/)
Feature-specific deep dives:
- Authentication system
- Interview session flow
- Feedback engine
- Question bank
- Dashboard components

#### [Integrations](./integrations/)
Third-party integration guides:
- LiveKit (real-time voice)
- Supabase (database & auth)
- Google Sheets (question sync)
- Inngest (background jobs)
- Cron jobs setup

#### [Templates](./templates/)
Documentation templates for consistency:
- Feature documentation template
- ADR template
- API endpoint template
- Troubleshooting template

## For New Developers

1. Start with **[CLAUDE.md](../.claude/CLAUDE.md)** - understand the project structure
2. Read **[PRD.md](../.claude/PRD.md)** - understand product goals
3. Follow **[Setup Guide](./development/setup.md)** - get your environment running
4. Review **[Architecture Decisions](./architecture/adrs/README.md)** - understand key technical choices
5. Check **[CONTRIBUTING.md](../.claude/CONTRIBUTING.md)** - learn the development workflow

## For API Consumers

1. **[API Overview](./api/README.md)** - start here
2. **[Authentication](./api/authentication.md)** - auth flows and tokens
3. **[OpenAPI Spec](./api/openapi.yaml)** - full API specification
4. **[Examples](./api/)** - working code examples

## For Operators/DevOps

1. **[Deployment Guide](./deployment/README.md)** - production deployment
2. **[Environment Variables](./deployment/environment-variables.md)** - configuration reference
3. **[Troubleshooting](../.claude/TROUBLESHOOTING.md)** - common issues
4. **[LiveKit Debugging](./LIVEKIT_DEBUGGING.md)** - agent debugging guide

## Documentation Standards

See **[CONTRIBUTING.md](../.claude/CONTRIBUTING.md)** for:
- Where to put different types of documentation
- When to update documentation
- Documentation templates to use
- Review checklist

## Archive

Historical documentation and implementation logs are in `archive/2025-11/`. These are kept for reference but are not actively maintained.

## Contributing to Documentation

When adding new documentation:

1. **Choose the right location** - see Documentation Structure above
2. **Use templates** - check `docs/templates/` for guidelines
3. **Update indexes** - add links to relevant README files
4. **Keep CLAUDE.md updated** - update iteration log if completing a phase
5. **Test links** - ensure all cross-references work

## Questions?

- Check **[TROUBLESHOOTING.md](../.claude/TROUBLESHOOTING.md)** first
- Review relevant ADRs in **[architecture/adrs/](./architecture/adrs/)**
- Search **[CLAUDE.md](../.claude/CLAUDE.md)** for context

---

**Last Updated**: 2025-11-12
**Documentation Version**: 2.0 (Post-reorganization)
