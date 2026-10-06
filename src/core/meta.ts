// ビルド情報と URL パラメータ。公開先(Pages / itch.io)を問わず同じ dist が動く。
export const META = {
  buildTime: __BUILD_TIME__,
  sha: __GIT_SHA__,
  version: `${__GIT_SHA__}`,
};

const params = new URLSearchParams(location.search);
export const query = {
  get: (k: string) => params.get(k),
  has: (k: string) => params.has(k),
  /** ?auto=1 で自動プレイ(CI 確認・宣伝動画用) */
  auto: params.get('auto') === '1',
  /** ?lang=en|ja */
  lang: params.get('lang'),
};
