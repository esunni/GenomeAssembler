# GenomeAssembler

GenomeAssembler is a web application designed to help scientists streamline synthetic biology workflows. It provides two main tools:
1. **Design**: Helps find optimal 30bp overlapping regions for fragment assembly based on user constraints (promoter regions, CDS conservation, and silent mutations). Includes an interactive linear and circular genome map.
2. **Build (JANUS)**: A liquid handling protocol configurator. It takes protocol components and dispensing plate maps to automatically generate precise aspiration mapping files (.csv) for the JANUS automated pipetting system.

## GitHub Pages Deployment

GitHub Pages deployment is configured with a GitHub Actions workflow in [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml).

After pushing this branch to GitHub:

1. Open repository `Settings` -> `Pages`.
2. Under `Build and deployment`, set `Source` to `GitHub Actions` if GitHub prompts for a source.
3. Push to `janus-github-pages` for an immediate preview, or merge to `main` for the long-term deployment branch.

Expected site URL:

- `https://esunni.github.io/GenomeAssembler/`
