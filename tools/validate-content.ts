/** Content-integrity gate run before every build. Exits 1 on errors. */
import 'dotenv/config';
import { getContentContext } from '../src/repositories/factory';
import { formatIssues, hasErrors, validateContent } from '../src/application/content-validation';
const ctx = await getContentContext();
const [c, q] = await Promise.all([ctx.categories.getAllCategories(), ctx.questions.getAllQuestions()]);
const issues = validateContent(c, q, { allowDemoContent: ctx.env.allowDemoContent });
console.log(formatIssues(issues));
console.log(`\nProvider: ${ctx.env.dataProvider} · ${q.filter((x) => x.status === 'published').length} published questions · ${c.filter((x) => x.status === 'published' && x.publishedQuestionCount > 0).length} visible categories`);
if (hasErrors(issues)) { console.error('\n✖ Content validation FAILED. Fix the records above before building.'); process.exit(1); }
