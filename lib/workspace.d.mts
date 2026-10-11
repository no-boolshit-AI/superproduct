/** Types for lib/workspace.mjs (where your own material lives). */

export declare const KIT_ROOT: string;
export declare const WORKSPACE_ENV: "SUPERPRODUCT_WORKSPACE";
export declare const TEMPLATE_DIR: string;

export interface WorkspaceOptions {
  env?: Record<string, string | undefined>;
  /** Resolve symlinks when the folder exists (default true). */
  real?: boolean;
}
/** $SUPERPRODUCT_WORKSPACE (absolute, or relative to the kit), else <kit>/workspace; its real path when it exists. */
export declare function workspaceDir(opts?: WorkspaceOptions): string;
/** A path inside the workspace: workspacePath("sites") → <workspace>/sites. */
export declare function workspacePath(rel?: string, opts?: WorkspaceOptions): string;
/** Where an agent writes its results: <workspace>/out/<agent id>. */
export declare function outputDir(agentId: string, opts?: WorkspaceOptions): string;
/** Your reference images for an agent: <workspace>/references/<agent id>. */
export declare function referencesDir(agentId: string, opts?: WorkspaceOptions): string;
/** Create the workspace or add what it lacks (template files, a git repository); never overwrites. Returns what it created. */
export declare function createWorkspace(opts?: { dir?: string; git?: boolean; template?: string }): string[];
