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
- `dist/help/` — インストール、操作、トラブル対処、設定移行
- `dist/guides/` — PSD、VRMトラッキング、OBS連携の手順
- `dist/sitemap.xml`・`dist/robots.txt` — 検索クローラー向けの公開URL一覧
- `dist/style.css` — PC・スマートフォン対応
- `dist/screenshots/` — V Lens 0.1.36で内蔵PSDを開いた実画面
- `dist/favicon.svg` — ブランドアイコン
- `dist/_headers` — 対応ホスト用のセキュリティヘッダー
- `scripts/` — Node.js標準機能だけで動くプレビューと検証

Cloudflare WorkersのStatic Assetsで `dist/` 内を公開します。Worker名は `vlens-website`、カスタムドメインは [vlens.studiojuh.com](https://vlens.studiojuh.com) です。設定は `wrangler.jsonc` にあります。`main` にpushすると、Workers Buildsが `npm run check` を実行し、通過後に `npx --yes wrangler@4.158.0 deploy` で自動公開します。

## 公開内容の方針

Windows版インストーラーは、このリポジトリの [GitHub Releases](https://github.com/studio-juh/vlens-website/releases) で配布します。新版を公開したら、配布欄のバージョン、インストーラーのリンク、リリースノートのリンクを更新してください。アプリのソースコードは別の非公開リポジトリで管理します。

スクリーンショットは、撮影用の設定で内蔵PSDサンプルを開いたものです。第三者のアバターモデル・カメラ映像・ユーザー素材は含みません。

価格、公開日、未確認の性能、未実装機能は掲載していません。全身トラッキングは試験機能として記載しています。サイト自体はカメラ・マイクへのアクセスや解析用トラッキングを行いません。

サイトの公開範囲とアプリの配布条件は別に管理してください。公開リポジトリにした場合も、アプリ本体の公開・無償配布を意味しません。


## ブラウザ検証

WindowsにMicrosoft Edgeがある場合は `npm run check:browser` で、4種類の画面幅、スクリーンショットの表示と原寸リンク、FAQの開閉を確認できます。専用の一時プロファイルを使用し、確認用の画像はGit管理外の `.preview/` へ保存します。

