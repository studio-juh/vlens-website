# Vlens 公式サイト

Windows 11向けアバター・仮想カメラアプリ **Vlens（V Lens）** の紹介サイトです。アプリ本体とは独立したリポジトリで管理します。

## ローカルで表示

Node.js 22以降で実行できます。依存パッケージのインストールやビルドは不要です。

```sh
npm run dev
```

`http://127.0.0.1:4173` を開きます。終了は Ctrl+C。検証は `npm run check`。

## 構成

- `dist/index.html` — 日本語の製品紹介、機能、導入手順、FAQ、配布状況
- `dist/en/` — 英語のトップ・ヘルプ・各ガイド（日本語ページに対応）
- `dist/help/` — インストール、操作、トラブル対処、設定移行
- `dist/guides/` — PSD、VRMトラッキング、OBS連携の手順
- `dist/sitemap.xml`・`dist/robots.txt` — 検索クローラー向けの公開URL一覧
- `dist/style.css` — PC・スマートフォン対応
- `dist/screenshots/` — 内蔵PSD（0.1.36）・VRM（0.1.69）サンプルの実画面
- `dist/favicon.svg` — ブランドアイコン
- `dist/_redirects`・`dist/404.html` — URLの正規化と404案内
- `dist/_headers` — 対応ホスト用のセキュリティヘッダー
- `scripts/` — Node.js標準機能だけで動くプレビューと検証

Cloudflare WorkersのStatic Assetsで `dist/` 内を公開します。Worker名は `vlens-website`、カスタムドメインは [vlens.studiojuh.com](https://vlens.studiojuh.com) です。設定は `wrangler.jsonc` にあります。`main` にpushすると、Workers Buildsが `npm run check` を実行し、通過後に `npx --yes wrangler@4.158.0 deploy` で自動公開します。

## 日本語・英語ページ

日本語は `/`、英語は `/en/` で公開します。トップ・ヘルプ・3種類のガイドに対応するページを用意し、ヘッダーの「日本語 / EN」で同じ内容のページへ移動できます。画面幅が狭い場合も言語切り替えを表示します。自動リダイレクトは行いません。

各ページに自身のcanonicalと相互のhreflang（ja・en・x-default）を設定し、サイトマップには両言語を含めます。内容・配布版を変更したら両言語を更新してください。スクリーンショットは共有します。アプリ自体のUIは日本語のため、英語の操作手順には実際の日本語メニュー名を併記します。

## 公開内容の方針

Windows版インストーラーは、このリポジトリの [GitHub Releases](https://github.com/studio-juh/vlens-website/releases) で配布します。新版を公開したら、配布欄のバージョン、インストーラーのリンク、リリースノートのリンクを更新してください。アプリのソースコードは別の非公開リポジトリで管理します。

スクリーンショットは内蔵PSD・VRMサンプルを表示したものです。VRM画像は0.1.69で、カメラを使わずに撮影しています。内蔵VRMサンプル「[千駄ヶ谷 篠](https://hub.vroid.com/characters/4593660874193246717/models/7956589129305596116)」はpixivのCC0モデルをCoatie（Koh-Tee）がVRM 1.0へ変換したもので、V Lensではテクスチャを軽量化しています。カメラ映像やユーザー素材は含みません。

価格、公開日、未確認の性能、未実装機能は掲載していません。0.1.70の更新確認と、身体・手指の追跡、手の安定性設定、身体・手指プレビューを案内しています。全身トラッキングと隠れた関節の補完は試験機能として記載しています。サイト自体はカメラ・マイクへのアクセスや解析用トラッキングを行いません。

サイトの公開範囲とアプリの配布条件は別に管理してください。公開リポジトリにした場合も、アプリ本体の公開・無償配布を意味しません。


## ブラウザ検証

WindowsにMicrosoft Edgeがある場合は `npm run check:browser` で、日英両方の4種類の画面幅、スクリーンショットの表示と原寸リンク、FAQの開閉、各ガイド、言語切り替えを確認できます。専用の一時プロファイルを使用し、確認用の画像はGit管理外の `.preview/` へ保存します。


## SEOと画像の更新

日英10ページに固有のタイトル・説明、canonical・相互hreflang、Open Graph・Twitterの画像情報を設定しています。構造化データはページ上の情報から生成し、サイト・運営者・アプリ・各ページ・ガイドと、画面に表示したパンくずを関連付けます。サイトの識別子は言語間で共通です。

本文・見出し・説明・配布リンクを編集したら、実質的に更新したURLの日時だけを `scripts/seo-pages.json` で更新し、`npm run prepare:seo` を実行してください。生成されたHTMLと、更新日・言語・画像を含むサイトマップを一緒にコミットします。検証の `npm run check` は、生成情報の反映漏れも検出します。更新日はビルドのたびに変更しません。

スクリーンショットのJPEG原本は保存し、`picture` のWebP派生を640px・960px・原寸で用意します。原寸3枚の合計は約259KBから約131KBになりました。原寸リンクはJPEGのままです。最初の画像を優先して読み込み、画面下の画像は遅延読み込みにします。画像を差し替えたら `npm run prepare:images`（WindowsのEdgeが必要）で派生画像とPNGアイコンを再生成し、`npm run prepare:seo` も実行してください。

既知ページのスラッシュなし・index.htmlは `dist/_redirects` の301で正規URLへ移動します。存在しないURLは案内ページと404を返し、サイトマップに含めません。Cloudflare管理のrobots設定は変更していません。

公開後は検索エンジンの再クロール・再評価が必要です。Search ConsoleやBing Webmaster Toolsでの所有権確認・サイトマップ送信は、別途それぞれのアカウントで行います。公開用サイトマップは [sitemap.xml](https://vlens.studiojuh.com/sitemap.xml) です。

設定の根拠は [Googleの構造化データ](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)、[パンくず](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)、[サイトマップ](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)、[画像](https://developers.google.com/search/docs/appearance/google-images) の公式ガイドを参照してください。
