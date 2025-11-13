# Documentation Templates

This directory contains templates for creating consistent documentation across the Meelni project.

## Available Templates

### [Feature Documentation Template](./FEATURE_TEMPLATE.md)
Use when documenting a new feature or major component.

**When to use**:
- Adding a new user-facing feature
- Documenting a major system component
- Creating deep-dive technical documentation

**Where to put**: `docs/features/[feature-name].md`

### [ADR Template](./ADR_TEMPLATE.md)
Use when making significant architectural or technical decisions.

**When to use**:
- Choosing between technology options
- Making infrastructure decisions
- Establishing technical patterns or conventions
- Making decisions with long-term consequences

**Where to put**: `docs/architecture/adrs/ADR-XXX-[descriptive-title].md`

### [API Endpoint Template](./API_ENDPOINT_TEMPLATE.md)
Use when documenting new API endpoints.

**When to use**:
- Adding new REST API endpoints
- Documenting API changes or updates
- Creating API reference documentation

**Where to put**: `docs/api/[endpoint-name].md`

### [Troubleshooting Template](./TROUBLESHOOTING_TEMPLATE.md)
Use when documenting common issues and solutions.

**When to use**:
- Encountered a non-obvious bug with a solution
- Debugging a complex issue worth documenting
- Creating runbooks for common problems

**Where to put**: Append to `.claude/TROUBLESHOOTING.md` or create dedicated guide

## Usage Guidelines

### 1. Choose the Right Template

Match your documentation need to the appropriate template:

| Documentation Type | Template | Location |
|-------------------|----------|----------|
| Architecture decision | ADR Template | `docs/architecture/adrs/` |
| Feature deep dive | Feature Template | `docs/features/` |
| API endpoint | API Template | `docs/api/` |
| Troubleshooting guide | Troubleshooting Template | `.claude/TROUBLESHOOTING.md` |
| Setup guide | Development Template | `docs/development/` |
| Integration guide | (Custom) | `docs/integrations/` |

### 2. Fill Out All Sections

Don't skip sections - if a section doesn't apply, write "N/A" or "Not applicable" with a brief explanation.

### 3. Update Indexes

After creating documentation:
- Update the relevant README.md file
- Add links from related documentation
- Update `.claude/CLAUDE.md` if it's a major change

### 4. Use Consistent Formatting

- Use Markdown consistently
- Follow existing file naming conventions (kebab-case)
- Use relative links for internal documentation
- Include code examples where helpful

## Template Customization

These templates are starting points. Adapt them to your specific needs, but maintain:
- Clear structure
- Consistent formatting
- Adequate detail for future reference

## Examples

Good examples of documentation following these templates:

- **Feature Doc**: `docs/features/authentication.md` (when created)
- **ADR**: `docs/architecture/adrs/ADR-003-tech-stack-finalization.md`
- **API Doc**: `docs/api/authentication.md`
- **Troubleshooting**: `.claude/TROUBLESHOOTING.md`

## Contributing

When improving these templates:
1. Update the template file
2. Update this README if adding/removing templates
3. Update `.claude/CONTRIBUTING.md` with any new guidelines
4. Notify team of template changes

---

**Last Updated**: 2025-11-12
