/*
 * Minimal <sys/cdefs.h> shim for MSVC.
 *
 * The vendored BSD <sys/queue.h> in this folder #includes <sys/cdefs.h>, which
 * exists on macOS/Linux but not in the MSVC toolchain. macOS/Linux use their
 * system headers (this compat/ dir is added to the include path on Windows
 * only, via binding.gyp's OS=='win' condition), so this file is consumed by
 * MSVC alone. It defines just the handful of helper macros queue.h may expand
 * to; ebur128.c only uses the STAILQ_* family, none of which reference these,
 * but they are provided so a future queue.h macro (e.g. STAILQ_LAST) won't
 * reintroduce this build break.
 */
#ifndef _SYS_CDEFS_H_
#define _SYS_CDEFS_H_

#include <stddef.h> /* offsetof */

#ifndef __offsetof
#define __offsetof(type, field) offsetof(type, field)
#endif

#ifndef __containerof
#define __containerof(ptr, type, member) \
  ((type*) (void*) ((char*) (ptr) -offsetof(type, member)))
#endif

#ifdef __cplusplus
#ifndef __BEGIN_DECLS
#define __BEGIN_DECLS extern "C" {
#define __END_DECLS }
#endif
#else
#ifndef __BEGIN_DECLS
#define __BEGIN_DECLS
#define __END_DECLS
#endif
#endif

#endif /* _SYS_CDEFS_H_ */
