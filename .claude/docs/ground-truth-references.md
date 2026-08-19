# Ground-Truth References — read the artifact, don't recall the API

> Portable doctrine. It belongs to the harness, not to any one project: the extractor
> changes per ecosystem, the rule does not. The project-specific tooling that implements
> it lives in `execution/` and does not travel.

## The failure this prevents

An agent writing against an unfamiliar API produces **plausible identifiers**. Not
hallucination in the dramatic sense — something worse, because it looks like knowledge:
a name that follows the library's own conventions, reads correctly to a reviewer, and
does not exist.

The recorded instance in this harness: `Mesh.EStlUnit.Millimeter`, written while
exporting an STL from PicoGK. Correct casing, correct namespace, plausible spelling.
The real member is `MM`. The assembly had that answer the whole time, three directories
away, and the shipped XML documentation did not mention it at all — which is precisely
why it got invented.

That is cheap when the compiler catches it. It is expensive in every dynamic language,
and worst of all across a network boundary, where a wrong field name comes back as an
empty result rather than an error.

## The rule

**Before working against a dependency you do not command, extract its machine-readable
truth into a file, and consult that file instead of your recollection.**

And the tighter form, which costs nothing:

> **If a name is checkable, check it before you write it.**

Two corollaries that matter more than they sound:

- **Prose is not truth.** Documentation, notes, memory files and tutorials describe what
  someone chose to write down. The artifact describes what exists. Where they disagree,
  the artifact wins — and the *gap* between them is exactly where invention happens, so
  a good extraction marks what the prose omits.
- **Extraction beats retrieval for this.** A generated reference cannot be wrong about
  what exists. Similarity search over prose can return a confident near-miss, which turns
  a loud failure into a silent one.

## Where the truth lives, per ecosystem

Every mature ecosystem ships something machine-readable. The tool differs; the discipline
does not.

| Ecosystem | Ground truth | How to extract |
|---|---|---|
| .NET | the assembly (+ the package's XML for prose) | reflection over the loaded assembly |
| TypeScript | `.d.ts` files | already ground truth — read them directly |
| Python | the installed module | `inspect.signature`, `dir()`, bundled `.pyi` stubs |
| Rust | the crate source / `cargo doc` | `cargo doc --no-deps`, or read `src/` |
| Go | the package | `go doc <pkg>` |
| REST API | its OpenAPI / GraphQL schema | fetch the spec, don't guess routes or fields |
| Database | the live schema | introspect; never assume column names |
| CLI tool | its own help | `--help`, man page |

## How to apply it

1. **Extract once per version**, into a file the repo keeps. Not per session — the cost
   is paid once and the artifact is committed.
2. **Do not inject it wholesale into context.** A full reference is thousands of lines
   and is needed only while writing against that API. Keep a one-line pointer where the
   agent always looks (`memory/MEMORY.md`, or the project's setup guide) saying the file
   exists and how to regenerate it.
3. **Guard it with a freshness check.** A reference generated from an older version is
   worse than none, because it reads as authoritative. In this harness that is an
   `execution/check_*.py` seam checker, which `/close` runs automatically.
4. **Mark what the prose omits.** Undocumented members are where guessing concentrates,
   so the generated file should call them out rather than render them identically.
5. **State the blind spots in the artifact itself.** A reference gives signatures, not
   semantics: it cannot say which overload is right, what a call costs, or that a method
   named `Fillet()` does not produce a fillet. That knowledge stays in notes and memory.

## Reference implementation

`execution/apidump/` (a small C# reflector) + `execution/gen_api_reference.py` (driver)
+ `execution/check_api_reference_freshness.py` (seam checker), producing
`docs/api/<pkg>-api.md`. Ported to another stack, only the extractor is rewritten.
