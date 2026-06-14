import type { TSESTree } from '@typescript-eslint/utils';

/** Normalized text of a comment: trimmed for line comments, block comments
 * joined into one line with leading `*` markers stripped. */
export function commentText(comment: TSESTree.Comment): string {
  if (comment.type === 'Line') {
    return comment.value.trim();
  }
  return comment.value
    .split('\n')
    .map(line => line.replace(/^\s*\*?/u, ''))
    .join(' ')
    .trim();
}

/** A JSDoc block (`/** ... `): exempt from prose-style comment rules so API
 * documentation can describe behavior freely. */
export function looksLikeJsDoc(comment: TSESTree.Comment): boolean {
  return comment.type === 'Block' && comment.value.startsWith('*');
}
