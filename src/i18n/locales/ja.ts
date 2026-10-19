import type { Dict } from '../ui';

export const ja: Dict = {
  meta: {
    landing: {
      title: 'Open Bitcoin Tracker',
      description: '楽しくて、便利で、美しいビットコインツール。',
    },
    home: {
      title: 'Android向けOpen Bitcoin Tracker',
      description:
        'ビットコインのスタックの価値を追跡する、プライバシー重視のオープンソース Android アプリ。アカウント不要、解析なし、テレメトリーなし。',
    },
    about: {
      title: 'プロジェクトについて — Open Bitcoin Tracker',
      description:
        'Open Bitcoin Trackerの無料オープンソースのビットコインツールとAndroid向けポートフォリオアプリを紹介。プロジェクト情報やデータソースも確認できます。',
    },
    privacy: {
      title: 'プライバシーポリシー — Open Bitcoin Tracker',
      description:
        'Open Bitcoin Tracker のプライバシーポリシー — ビットコインのスタックの価値を追跡する、プライバシー重視のオープンソース Android アプリ。',
    },
    ogImageAlt: 'Open Bitcoin Tracker — 無料のオープンソース・ビットコインツールとAndroidアプリ',
  },

  landing: {
    toolsLabel: 'ツールを使ってみる',
    openChart: 'チャートを開く',
    openEarth: '地図を探索',
    openVideo: '雰囲気をつくる',
    appTitle: 'Android版OBT',
    openApp: 'アプリについて詳しく見る',
    appDescription: '秘密鍵もシードフレーズも不要。ビットコインの保有量は手入力します。アプリで取引はできませんが、コツコツ貯めたビットコインが今いくらなのかを確認するのにとても便利です。',
    priceTracker: '価格トラッカー',
    priceDescription: 'ビットコインのリアルタイム価格と2010年からの価格履歴。',
    earthDescription: 'ビットコインを地球の陸地の割合として見てみよう。',
    supplyDescription: '法定通貨の供給量が毎年増える一方、ビットコインの供給量は増えないことを見てみよう。',
  },

  nav: {
    partyMode: 'Party Mode',
    menuLabel: 'メニュー',
    closeMenu: 'メニューを閉じる',
    skipToContent: 'コンテンツへ移動',
    mainAria: 'メインナビゲーション',
    github: 'GitHub',
    githubAria: 'GitHub リポジトリ',
    download: 'ダウンロード',
    langLabel: '言語',
    themeLabel: 'テーマ',
    themeAuto: '自動',
    themeDark: 'ダーク',
    themeLight: 'ライト',
  },

  hero: {
    subtitle: 'Android向けオープンソースのビットコイン・ポートフォリオ追跡アプリ',
    tagline: 'Android向けオープンソースのビットコイン・ポートフォリオ追跡アプリ。',
    downloadApk: 'APK をダウンロード',
    viewGithub: 'GitHub で見る',
    viewZapstore: 'Zapstore',
    altPrefix: 'Open Bitcoin Tracker — ',
    altSuffix: ' の画面',
    highlights: {
      fast: '高速',
      secure: '安全',
      openSource: 'オープンソース',
    },
    reasons: [
      {
        title: '完全なプライバシー',
        body: 'OBT はシードや鍵を必要としません。ビットコインの数量は手動で入力し、端末の外に出ることはありません。',
      },
      {
        title: '高速で軽量',
        body: 'OBT はノードに接続しないため、起動が速くバッテリーへの影響もごくわずかです。',
      },
    ],
  },

  themes: {
    heading: 'スタイルとともにホールド',
    sub: 'システムのモードに自動で追従する 4 つのテーマ。',
    regionAria: 'アプリのテーマ',
    showAria: '{label} のスクリーンショットを表示',
    altPrefix: 'Open Bitcoin Tracker — ',
    altSuffix: ' の画面',
    labels: ['Paper Cream', 'Salmon Press', 'Deepsea Blue', 'OLED Black'],
  },

  prices: {
    heading: '過去と将来の価格',
    sub: '過去のトレンドを分析し、将来の価値を予測します。',
    cards: [
      { title: '過去の価格追跡', body: 'ビットコインの過去の価格データを分析します。' },
      { title: '将来の予測ツール', body: '目標価格に基づいて価値をシミュレーションします。' },
    ],
  },

  privacy: {
    heading: '完全なプライバシー',
    sub: 'あなたのデータは端末内にとどまります。',
    cards: [
      { title: 'アカウント不要', body: '登録なし。アプリをインストールしてすぐに追跡を開始。' },
      { title: 'トラッキングなし', body: '解析ゼロ、広告なし、フィンガープリンティングなし。' },
      { title: '端末内のみ', body: 'スタックは端末内にとどまります。何もアップロードされません。' },
      { title: 'オープンソース', body: 'MIT ライセンス。信用するな、検証せよ。' },
    ],
  },

  kao: {
    body: '2026 年 9 月から、Google は Play ストア外でインストールされるアプリも含め、すべての Android 開発者に登録と本人確認を義務付けます。これは、このアプリのようなオープンソースアプリを脅かすものです。',
    linkText: '詳しくは keepandroidopen.org へ',
  },

  footer: {
    copyright: '© 2026 · MIT ライセンス',
    appHeader: 'アプリ',
    projectHeader: 'プロジェクト',
    about: 'OBTについて',
    privacy: 'プライバシーポリシー',
    github: 'GitHub',
    reportBug: 'バグを報告',
  },

  projectAbout: {
    h1: "OBTについて",
    dataHeading: "データの出典",
    livePrices: "Bitcoinのリアルタイム価格",
    history: "過去の価格",
    fx: "通貨換算",
    ecb: "欧州中央銀行の参考為替レート",
    earthSources: "計算方法と地図の出典はツール内の概要パネルで確認できます",
    contributeHeading: "オープンソース。コントリビューション歓迎。",
    contributeIntro: "コードの確認、ツールの提案、バグ報告、翻訳への協力を歓迎します。",
    repositories: "{website}と{app}には、それぞれ専用のリポジトリがあります。",
    issues: "{websiteIssues}または{appIssues}から参加できます。",
    license: "アプリケーションのコードはMITライセンスで公開しています（{websiteLicense}、{appLicense}）。",
    credits: "第三者のデータ、地図、フォント、メディアには、それぞれのライセンスとクレジットが適用されます。",
    website: "ウェブサイト",
    app: "Androidアプリ",
    websiteIssues: "ウェブサイトのIssue",
    appIssues: "アプリのIssue",
    appAboutLabel: "Androidアプリについて",
    appAboutTitle: "Androidアプリについて — Open Bitcoin Tracker",
    appAboutDescription: "AndroidアプリOpen Bitcoin Trackerの作者、データの出典、オープンソースライセンスについて。",
  },

  about: {
    h1: 'プロジェクトについて',
    dataSourcesHeader: 'Android アプリのデータソース',
    note: 'このアプリはこれらの提供元と一切の関係はありません。',
    licenses: 'GitHub の MIT ライセンス',
    madeBy: 'Max Hodler 作',
    forGrandma: 'おばあちゃんへ 🌼',
    profileHeader: '制作者 Max Hodler',
    followAria: 'X で Max Hodler をフォロー',
    primalAria: 'Nostr で Max Hodler をフォロー',
    dataSourceLabels: ['現在価格', '過去価格', '過去の為替レート', 'メモリプールとハッシュレート'],
  },

  policy: {
    h1: 'プライバシーポリシー',
    lastUpdated: '最終更新: 2026 年 5 月 26 日',
    intro:
      'このポリシーは、Open Bitcoin Tracker Android アプリ（以下「本アプリ」）が処理・保存・送信するデータについて説明します。本アプリは MIT ライセンスのもとでオープンソースソフトウェアとして公開されています。',
    sections: [
      {
        heading: '1. 概要',
        paras: [
          '本アプリは個人データを収集しません。ユーザーアカウント、解析、広告識別子、テレメトリーはありません。本アプリに入力したすべてのデータは、あなたの端末内にとどまります。',
        ],
      },
      {
        heading: '2. 端末に保存されるデータ',
        paras: [
          '以下の情報は本アプリの非公開ストレージにローカル保存され、開発者が運用するいかなるサーバーにも送信されません。',
        ],
        list: [
          '入力したスタック名とビットコインの残高。',
          'アプリの設定および表示設定。',
          '任意の PIN または生体認証によるロック解除設定（Android キーストアに保存）。',
        ],
        parasAfter: [
          '本アプリでは Android の Google ドライブへの自動バックアップが無効になっているため、ローカルに保存されたデータはこの仕組みによって Google のサーバーへコピーされることはありません。',
        ],
      },
      {
        heading: '3. ネットワークリクエスト',
        paras: [
          '市場データやオンチェーン情報を表示するため、本アプリは以下の第三者サービスにリクエストを送信します。これらのリクエストには、アカウント識別子・端末識別子・トラッキングパラメータは付加されません。',
        ],
        list: [
          'Kraken — リアルタイムの BTC 価格データ（WebSocket）。',
          'mempool.space — ブロック高、中央値手数料、ブロック予測。',
          'Coin Metrics — ネットワークの過去ハッシュレート。',
          '欧州中央銀行 — 法定通貨の日次基準為替レート。',
        ],
        parasAfter: [
          'これらの提供元は、リクエスト元の端末の IP アドレスを必然的に受け取ります。その情報の取り扱いは、各社のプライバシーポリシーに従います。',
        ],
      },
      {
        heading: '4. 収集しないデータ',
        paras: ['本アプリは以下のいずれも収集・送信・保存しません。'],
        list: [
          'ユーザーアカウント、サインイン資格情報、メールアドレス。',
          '解析または製品利用データ（例: Firebase Analytics、Sentry、Mixpanel）。',
          '広告識別子または広告 SDK。',
          '端末外へのクラッシュレポート。',
        ],
      },
      {
        heading: '5. 権限',
        paras: ['本アプリは以下の Android 権限を要求します。'],
        list: [
          'インターネット — 市場データとメモリプール情報の取得に必要。',
          '生体認証（任意）— 有効にすると、本アプリは Android の BiometricPrompt API を使ってローカルでロックを解除します。生体データは Android OS が管理し、本アプリが受け取ったり保存したりすることはありません。',
        ],
        parasAfter: [
          '本アプリは、連絡先・位置情報・カメラ・マイク・一般的なファイルストレージへのアクセスを要求しません。',
        ],
      },
      {
        heading: '6. ソースコード',
        paras: [
          '本アプリの完全なソースコードは公開されており、MIT ライセンスの条件のもとで独立して監査・ビルド・改変できます。',
        ],
        repoLabel: 'リポジトリ:',
      },
      {
        heading: '7. 子ども',
        paras: [
          '本アプリは子ども向けではありません。個人データを収集しないため、年齢を問わず子どもの個人データを意図的に処理することはありません。',
        ],
      },
      {
        heading: '8. 本ポリシーの変更',
        paras: [
          '本ポリシーが更新された場合、改訂版がこのページに公開され、上記の「最終更新」日が変更日を反映するよう更新されます。データの取り扱いに関する重要な変更がある場合は、ここに反映されます。',
        ],
      },
      {
        heading: '9. お問い合わせ',
        contactBefore: '本ポリシーに関するご質問は、プロジェクトのリポジトリに issue としてお寄せください:',
        contactAfter: '。',
      },
    ],
  },
};
