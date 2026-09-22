# Blog publishing guide

Blog articles are Markdown files stored in `src/content/blog/`.

## Create an article

Copy the template:

    cp src/content/blog/_article-template.md.example src/content/blog/article-slug.md

The filename becomes the URL. For example:

    src/content/blog/party-game-ideas.md
    /blog/party-game-ideas/

Keep `draft: true` while writing. Change it to `draft: false` when the article is reviewed and ready to publish.

Use only one H1. The article title automatically becomes the H1. Use `##` for main sections and `###` for subsections.

Store article images in `public/images/blog/`. Prefer compressed WebP images around 1200 × 630 pixels and below 200 KB.

Before publishing, confirm:

- The article answers one clear search intent
- The information is original and useful
- The title and description are accurate
- Headings make the article easy to scan
- Spelling and grammar are reviewed
- Internal links help the reader
- Images are compressed and have useful alt text
- The article does not compete with another article
- `draft` is set to `false`

Validate with:

    npx prettier --write src/content/blog/article-slug.md
    npm run check
    npm run lint
    npm run build:mock
    git diff --check

Preview with:

    npm run dev:mock

Then open `/blog/` and the new article URL.
