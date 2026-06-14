import { createRule } from '../utils/createRule';

export const RULE_NAME = 'no-pr-reference-comments';

type MessageIds = 'prReferenceComment';

interface PrPattern {
  readonly pattern: RegExp;
  readonly label: string;
}

const PR_PATTERNS: readonly PrPattern[] = [
  {
    pattern: /https?:\/\/github\.com\/[^\s)]+\/(?:pull|issues)\/\d+/iu,
    label: 'GitHub PR/issue URL',
  },
  {
    pattern: /\b(?:see|closes?|fixes|fixed|addresses|resolves?|refs?)\s+#\d+/iu,
    label: 'issue/PR reference',
  },
  {
    pattern: /\bPRs?\s+#?\d+/iu,
    label: 'PR number',
  },
  {
    pattern: /(?:^|[\s(])#\d+\b/u,
    label: 'issue/PR number',
  },
];

export const noPrReferenceCommentsRule = createRule<[], MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow PR/issue references in comments. They belong in commit messages and PR descriptions, where they do not rot when the repo moves, the issue tracker migrates, or the numbering changes.',
    },
    schema: [],
    messages: {
      prReferenceComment:
        'Comment contains {{label}} ({{snippet}}). Move it to the commit message or PR description. The git log is the canonical place for repo-history references.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      Program(): void {
        for (const comment of context.sourceCode.getAllComments()) {
          const text = comment.value;
          if (text.trim() === '') {
            continue;
          }
          for (const { pattern, label } of PR_PATTERNS) {
            const match = pattern.exec(text);
            if (match === null) {
              continue;
            }
            const matched = match[0].trim();
            const snippet = matched.length > 40 ? `${matched.slice(0, 40)}...` : matched;
            context.report({
              loc: comment.loc,
              messageId: 'prReferenceComment',
              data: { label, snippet },
            });
            break;
          }
        }
      },
    };
  },
});
