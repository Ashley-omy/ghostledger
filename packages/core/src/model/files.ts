/**
 * Which files make up the on-device model, and where they live on Hugging Face.
 * Pure functions, so they are unit-tested.
 */

export type ModelDtype = 'q4f16' | 'q4';

export interface ModelFile {
  /** Path inside the repo, e.g. "onnx/decoder_model_merged_q4f16.onnx_data" */
  path: string;
  size: number;
}

export interface ModelManifest {
  modelId: string;
  dtype: ModelDtype;
  /** Commit sha the download is pinned to, so a resumed download never mixes two versions. */
  revision: string;
  files: ModelFile[];
  totalBytes: number;
  complete: boolean;
}

export interface HubTreeEntry {
  type: 'file' | 'directory';
  path: string;
  size: number;
  lfs?: { size: number };
}

const HUB = 'https://huggingface.co';

/** Small config/tokenizer files at the repo root that Transformers.js may read. */
const ROOT_FILE = /^[^/]+\.(json|jinja|txt|model)$/;

/**
 * Keeps the root config files plus every ONNX session file for one dtype:
 * onnx/<session>_<dtype>.onnx and its external data (.onnx_data, .onnx_data_1, …).
 * "q4" must not match "q4f16", hence the exact suffix.
 */
export function selectModelFiles(tree: HubTreeEntry[], dtype: ModelDtype): ModelFile[] {
  const onnx = new RegExp(`^onnx/[a-z0-9_]+_${dtype}\\.onnx(_data(_\\d+)?)?$`);
  return tree
    .filter((e) => e.type === 'file' && (ROOT_FILE.test(e.path) || onnx.test(e.path)))
    .map((e) => ({ path: e.path, size: e.lfs?.size ?? e.size }))
    .sort((a, b) => a.size - b.size); // small files first: the app learns early if something is wrong
}

export function modelFileUrl(modelId: string, revision: string, path: string): string {
  return `${HUB}/${modelId}/resolve/${revision}/${path}`;
}

/**
 * Maps a Transformers.js cache key back to a repo path. Keys look like
 *   https://huggingface.co/<modelId>/resolve/<revision>/<path>   or   /models/<modelId>/<path>
 * Returns null for keys that aren't files of this model (e.g. ONNX Runtime .wasm).
 */
export function repoPathFromKey(key: string, modelId: string): string | null {
  const i = key.indexOf(`${modelId}/`);
  if (i === -1) return null;
  let rest = key.slice(i + modelId.length + 1);
  const resolve = rest.match(/^resolve\/[^/]+\/(.+)$/);
  if (resolve) rest = resolve[1]!;
  rest = rest.split(/[?#]/)[0]!;
  return rest || null;
}

const HUB_URL = /^https:\/\/(huggingface\.co|hf\.co)\//;

/**
 * A fetch for Transformers.js that never downloads model files. Transformers.js refuses to run with
 * both `allowLocalModels` and `allowRemoteModels` off, so we leave remote "on" and answer every Hub
 * request with a local 404 instead. Files we downloaded are served earlier by OpfsModelCache;
 * a 404 makes optional files resolve to null and missing required files fail with a clear error.
 * Other URLs (e.g. the ONNX Runtime .wasm on jsDelivr) go to the real fetch.
 */
export function hubBlockingFetch(realFetch: typeof fetch): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (HUB_URL.test(url)) {
      return Promise.resolve(new Response(null, { status: 404, statusText: 'Not part of the downloaded model' }));
    }
    return realFetch(input, init);
  };
}

export async function fetchManifest(
  modelId: string,
  dtype: ModelDtype,
  fetchFn: typeof fetch = fetch,
): Promise<ModelManifest> {
  const info = await fetchFn(`${HUB}/api/models/${modelId}`);
  if (!info.ok) throw new Error(`Model info request failed (${info.status})`);
  const { sha } = (await info.json()) as { sha: string };

  const treeRes = await fetchFn(`${HUB}/api/models/${modelId}/tree/${sha}?recursive=true`);
  if (!treeRes.ok) throw new Error(`Model file list request failed (${treeRes.status})`);
  const files = selectModelFiles((await treeRes.json()) as HubTreeEntry[], dtype);
  if (!files.some((f) => f.path.endsWith('.onnx'))) throw new Error(`No ${dtype} ONNX files found for ${modelId}`);

  return {
    modelId,
    dtype,
    revision: sha,
    files,
    totalBytes: files.reduce((n, f) => n + f.size, 0),
    complete: false,
  };
}
