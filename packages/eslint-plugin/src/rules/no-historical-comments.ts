import { commentText, looksLikeJsDoc } from '../utils/comments';
import { createRule } from '../utils/createRule';

export const RULE_NAME = 'no-historical-comments';

type MessageIds = 'historicalComment';

/*
 * Patterns that frame code by a prior state or a past incident, instead of the
 * current invariant. Each entry is deliberately narrow: bare "now" / "legacy" /
 * "previously" appear in legitimate prose, so the rule only matches the
 * specific past-tense narration constructions that must come out.
 */
const HISTORICAL_PATTERNS: readonly RegExp[] = [
  /\bbefore\s+the\s+fix\b/iu,
  /\bafter\s+the\s+fix\b/iu,
  /\bbefore\s+the\s+refactor\b/iu,
  /\bafter\s+the\s+refactor\b/iu,
  /\bwe\s+used\s+to\b/iu,
  /\bthis\s+used\s+to\b/iu,
  /\bused\s+to\s+be\b/iu,
  /\bno\s+longer\b/iu,
  /\bkept\s+for\s+(?:backwards|backward|legacy|compat)\b/iu,
  /\b(?:was|were)\s+a\s+(?:footgun|bug)\b/iu,
  /\bhistorical(?:ly)?\b/iu,
];

export const noHistoricalCommentsRule = createRule<[], MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Disallow comments that frame code relative to what it used to do or to a past incident ('before the fix', 'after the refactor', 'we used to', 'no longer'). Source comments describe the current invariant; history belongs in the commit message or PR description, where it does not rot when the code changes again.",
    },
    schema: [],
    messages: {
      historicalComment:
        'Historical narration ({{snippet}}). Source comments describe the current invariant, not what the code used to do. Move the history to the commit message or delete the comment.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      Program(): void {
        for (const comment of context.sourceCode.getAllComments()) {
          if (looksLikeJsDoc(comment)) {
            continue;
          }
          const text = commentText(comment);
          if (text === '') {
            continue;
          }
          for (const pattern of HISTORICAL_PATTERNS) {
            const match = pattern.exec(text);
            if (match !== null) {
              const matched = match[0];
              const snippet = matched.length > 40 ? `${matched.slice(0, 40)}...` : matched;
              context.report({
                loc: comment.loc,
                messageId: 'historicalComment',
                data: { snippet },
              });
              break;
            }
          }
        }
      },
    };
  },
});
