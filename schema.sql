-- =====================================================================
-- 荒井機工 販売管理システム（新） データベーススキーマ (PostgreSQL 16)
-- 現行システム（Windows 2000/XP/Vista Ver2.01）のマスター・伝票構成を
-- 踏襲しつつ、Web/クラウド運用に合わせて再設計したもの。
-- 日本語コメントは旧システムの画面項目名との対応を示す。
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid() 用
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- 商品名・得意先名のあいまい検索用（商品約14.6万件を実データで確認し追加）

-- ---------------------------------------------------------------------
-- 0. 認証・ユーザー
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    login_id        VARCHAR(50)  NOT NULL UNIQUE,
    display_name    VARCHAR(100) NOT NULL,
    password_hash   TEXT NOT NULL,
    role            VARCHAR(20)  NOT NULL DEFAULT 'staff', -- admin / staff / viewer(スマホ閲覧専用 等)
    staff_code      VARCHAR(10),   -- 担当者マスターとの紐付け（staff.code）。下で FK を追加
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 1. コードマスター群（単位・分類・地区・部署・担当者・摘要・銀行）
-- ---------------------------------------------------------------------
CREATE TABLE units ( -- 単位マスター
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(20) NOT NULL
);

CREATE TABLE departments ( -- 部署マスター
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(40) NOT NULL
);

CREATE TABLE regions ( -- 地区マスター
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(40) NOT NULL
);

CREATE TABLE staff ( -- 担当者マスター
    code         VARCHAR(10) PRIMARY KEY,
    name         VARCHAR(40) NOT NULL,
    department_code VARCHAR(10) REFERENCES departments(code),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE users ADD CONSTRAINT fk_users_staff FOREIGN KEY (staff_code) REFERENCES staff(code) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE remarks_master ( -- 摘要マスター（伝票の摘要欄でよく使う定型文）
    code VARCHAR(10) PRIMARY KEY,
    text VARCHAR(100) NOT NULL
);

CREATE TABLE banks ( -- 銀行名・自社名登録
    code            VARCHAR(10) PRIMARY KEY,
    name            VARCHAR(60) NOT NULL,
    is_own_company  BOOLEAN NOT NULL DEFAULT FALSE,
    branch_name     VARCHAR(60),  -- 支店名（実物の請求書に「森本支店」等が印字されるため追加）
    account_type    VARCHAR(10),  -- 口座種別（普通/当座）
    account_number  VARCHAR(20),  -- 口座番号
    account_holder  VARCHAR(60)   -- 口座名義
);

-- 商品分類：大分類・中分類・小分類（3階層）
CREATE TABLE product_class_major (  -- 大分類マスター
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(40) NOT NULL
);
CREATE TABLE product_class_middle ( -- 中分類マスター
    code VARCHAR(10) PRIMARY KEY,
    major_code VARCHAR(10) NOT NULL REFERENCES product_class_major(code),
    name VARCHAR(40) NOT NULL
);
CREATE TABLE product_class_minor ( -- 小分類マスター
    code VARCHAR(10) PRIMARY KEY,
    middle_code VARCHAR(10) NOT NULL REFERENCES product_class_middle(code),
    name VARCHAR(40) NOT NULL
);

-- 商品分類区分①②③（旧: 商品分類マスター①②③）自由設定の追加分類軸
CREATE TABLE product_category_1 (code VARCHAR(10) PRIMARY KEY, name VARCHAR(40) NOT NULL);
CREATE TABLE product_category_2 (code VARCHAR(10) PRIMARY KEY, name VARCHAR(40) NOT NULL);
CREATE TABLE product_category_3 (code VARCHAR(10) PRIMARY KEY, name VARCHAR(40) NOT NULL);

-- 得意先分類区分①②③（旧: 得意先分類マスター①②③）
CREATE TABLE customer_category_1 (code VARCHAR(10) PRIMARY KEY, name VARCHAR(40) NOT NULL);
CREATE TABLE customer_category_2 (code VARCHAR(10) PRIMARY KEY, name VARCHAR(40) NOT NULL);
CREATE TABLE customer_category_3 (code VARCHAR(10) PRIMARY KEY, name VARCHAR(40) NOT NULL);

-- ---------------------------------------------------------------------
-- 2. 消費税率履歴（旧: 環境マスター 消費税履歴1〜5）
-- ---------------------------------------------------------------------
CREATE TABLE tax_rate_history (
    id          SERIAL PRIMARY KEY,
    starts_on   DATE NOT NULL,          -- 開始日付
    rate        NUMERIC(5,2) NOT NULL,  -- 税率 (例 10.00)
    UNIQUE(starts_on)
);

-- ---------------------------------------------------------------------
-- 3. 得意先・送付先
-- ---------------------------------------------------------------------
CREATE TABLE customers ( -- 得意先マスター
    code                VARCHAR(10) PRIMARY KEY,       -- 得意先コード
    reference_code      VARCHAR(10),                   -- 参照コード
    name1               VARCHAR(60) NOT NULL,          -- 得意先名称1
    name2               VARCHAR(60),                   -- 得意先名称2
    short_name          VARCHAR(30),                   -- 得意先略称
    kana                VARCHAR(60),                   -- フリガナ
    honorific           VARCHAR(10),                   -- 敬称区分（御中 等）
    closing_day         SMALLINT,                      -- 締日
    collection_day      SMALLINT,                      -- 集金日
    collection_type     VARCHAR(10),                   -- 集金区分
    collection_note     VARCHAR(200),                  -- 集金備考
    staff_code          VARCHAR(10) REFERENCES staff(code), -- 担当者コード
    postal_code         VARCHAR(10),
    address1             VARCHAR(100),
    address2             VARCHAR(100),
    phone               VARCHAR(20),
    fax                 VARCHAR(20),
    mobile              VARCHAR(20),
    region_code         VARCHAR(10) REFERENCES regions(code), -- 地区コード
    billing_customer_code VARCHAR(10) REFERENCES customers(code), -- 請求先コード（請求をまとめる先）
    category1_code      VARCHAR(10) REFERENCES customer_category_1(code),
    category2_code      VARCHAR(10) REFERENCES customer_category_2(code),
    category3_code      VARCHAR(10) REFERENCES customer_category_3(code),
    trade_started_on    DATE,           -- 取引開始日
    opening_balance     NUMERIC(14,2) DEFAULT 0, -- 稼動時残高
    price_rank          SMALLINT,       -- 売上単価ランク（商品の売上単価①〜⑤に対応）
    markup_rate         NUMERIC(6,3),   -- 掛率
    tax_method          SMALLINT DEFAULT 0, -- 課税方式 0:外税 1:内税
    calc_method         SMALLINT DEFAULT 0, -- 計算方式 0:請求単位 1:明細単位
    rounding_method      SMALLINT DEFAULT 0, -- 丸め方式 0:四捨五入 1:切捨て 2:切上げ
    note                VARCHAR(200),
    memo                TEXT,
    image_path          TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_delivery_addresses ( -- 送付先マスター
    id           SERIAL PRIMARY KEY,
    customer_code VARCHAR(10) NOT NULL REFERENCES customers(code),
    seq          SMALLINT NOT NULL DEFAULT 1,
    name         VARCHAR(60) NOT NULL,
    postal_code  VARCHAR(10),
    address1      VARCHAR(100),
    address2      VARCHAR(100),
    phone        VARCHAR(20),
    UNIQUE(customer_code, seq)
);

-- ---------------------------------------------------------------------
-- 4. 仕入先
-- ---------------------------------------------------------------------
CREATE TABLE suppliers ( -- 仕入先マスター
    code            VARCHAR(10) PRIMARY KEY,
    reference_code  VARCHAR(10),
    name1           VARCHAR(60) NOT NULL,
    name2           VARCHAR(60),
    short_name      VARCHAR(30),
    kana            VARCHAR(60),
    closing_day     SMALLINT,
    payment_day     SMALLINT,           -- 支払日
    staff_code      VARCHAR(10) REFERENCES staff(code),
    postal_code     VARCHAR(10),
    address1         VARCHAR(100),
    address2         VARCHAR(100),
    phone           VARCHAR(20),
    fax             VARCHAR(20),
    mobile          VARCHAR(20),
    trade_started_on DATE,
    opening_balance NUMERIC(14,2) DEFAULT 0,
    tax_method      SMALLINT DEFAULT 0,
    calc_method     SMALLINT DEFAULT 0,
    rounding_method  SMALLINT DEFAULT 0,
    note            VARCHAR(200),
    memo            TEXT,
    image_path      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 5. 商品
-- ---------------------------------------------------------------------
CREATE TABLE products ( -- 商品マスター
    code               VARCHAR(15) PRIMARY KEY,      -- 商品コード
    reference_code     VARCHAR(15),
    name               VARCHAR(80) NOT NULL,         -- 商品名
    spec               VARCHAR(80),                  -- 規格
    kana               VARCHAR(80),
    unit_code          VARCHAR(10) REFERENCES units(code),
    tax_category       SMALLINT DEFAULT 0,            -- 消費税区分
    stock_managed      BOOLEAN NOT NULL DEFAULT TRUE,  -- 在庫区分
    cost_category      SMALLINT DEFAULT 0,             -- 原価区分
    major_class_code   VARCHAR(10) REFERENCES product_class_major(code),
    middle_class_code  VARCHAR(10) REFERENCES product_class_middle(code),
    minor_class_code   VARCHAR(10) REFERENCES product_class_minor(code),
    category1_code     VARCHAR(10) REFERENCES product_category_1(code),
    category2_code     VARCHAR(10) REFERENCES product_category_2(code),
    category3_code     VARCHAR(10) REFERENCES product_category_3(code),
    sale_price_1       NUMERIC(12,2),  -- 売上単価①
    sale_price_2       NUMERIC(12,2),  -- 売上単価②
    sale_price_3       NUMERIC(12,2),  -- 売上単価③
    sale_price_4       NUMERIC(12,2),  -- 売上単価④
    sale_price_5       NUMERIC(12,2),  -- 売上単価⑤
    standard_cost      NUMERIC(12,2),  -- 標準仕入単価
    last_cost          NUMERIC(12,2),  -- 最終仕入単価
    moving_avg_cost    NUMERIC(12,4),  -- 移動平均単価
    stock_qty          NUMERIC(14,3) NOT NULL DEFAULT 0, -- 在庫数量
    stock_amount       NUMERIC(14,2) NOT NULL DEFAULT 0, -- 在庫金額
    last_purchased_on  DATE,
    last_sold_on       DATE,
    memo               TEXT,
    image_path         TEXT,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE set_products ( -- セット商品マスター（複数商品をまとめて1コードで販売）
    set_code       VARCHAR(15) NOT NULL REFERENCES products(code),
    seq            SMALLINT NOT NULL DEFAULT 1,
    component_code VARCHAR(15) NOT NULL REFERENCES products(code),
    quantity       NUMERIC(10,3) NOT NULL DEFAULT 1,
    PRIMARY KEY (set_code, seq)
);

-- ---------------------------------------------------------------------
-- 6. 伝票番号採番（旧: 環境マスター 最終伝票番号）
-- ---------------------------------------------------------------------
CREATE TABLE voucher_sequences (
    voucher_type VARCHAR(20) PRIMARY KEY, -- 'sales','receipt','purchase','payment','quotation' 等
    last_number  BIGINT NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- 7. 売上伝票／現金売上伝票（同一テーブル、is_cash_sale で区別）
-- ---------------------------------------------------------------------
CREATE TABLE sales_vouchers (
    id              BIGSERIAL PRIMARY KEY,
    voucher_no      VARCHAR(15) NOT NULL UNIQUE,   -- 伝票番号
    is_cash_sale    BOOLEAN NOT NULL DEFAULT FALSE, -- 現金売上伝票入力から起票されたか
    quotation_no    VARCHAR(15),                    -- 見積番号（元見積からの転記）
    customer_code   VARCHAR(10) NOT NULL REFERENCES customers(code),
    delivery_address_id INTEGER REFERENCES customer_delivery_addresses(id), -- 送付先
    voucher_date    DATE NOT NULL,                  -- 伝票日付
    entered_on      DATE,                           -- 入力日付（伝票日付と異なりうる。実データで別列として運用されていたため追加）
    tax_rate        NUMERIC(5,2) NOT NULL,          -- 消費税率（伝票時点の税率をスナップショット）
    staff_code      VARCHAR(10) REFERENCES staff(code),
    remarks         VARCHAR(200),                   -- 摘要
    sales_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    cost_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    gross_profit    NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_printed      BOOLEAN NOT NULL DEFAULT FALSE,  -- 伝票印刷済みフラグ
    is_billed       BOOLEAN NOT NULL DEFAULT FALSE,  -- 請求更新済みフラグ
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sales_voucher_lines (
    id              BIGSERIAL PRIMARY KEY,
    voucher_id      BIGINT NOT NULL REFERENCES sales_vouchers(id) ON DELETE CASCADE,
    line_no         SMALLINT NOT NULL,
    category        VARCHAR(10),               -- 区分
    product_code    VARCHAR(15) REFERENCES products(code),
    product_name    VARCHAR(80) NOT NULL,      -- 商品マスター未登録の自由入力にも対応
    spec            VARCHAR(80),
    unit            VARCHAR(10),
    quantity        NUMERIC(12,3) NOT NULL DEFAULT 0,
    cost_price      NUMERIC(12,2),             -- 仕入単価
    cost_amount     NUMERIC(14,2),             -- 仕入金額
    sale_price      NUMERIC(12,2),             -- 売上単価
    sale_amount     NUMERIC(14,2),             -- 売上金額
    gross_profit    NUMERIC(14,2),             -- 粗利額
    tax_amount      NUMERIC(14,2),             -- 明細消費税（実データで伝票消費税と別に明細ごとに保持されていたため追加）
    note            VARCHAR(100),              -- 備考
    note2           VARCHAR(100),              -- 備考2（実データに2つ目の自由記入欄があったため追加）
    UNIQUE(voucher_id, line_no)
);

-- ---------------------------------------------------------------------
-- 8. 仕入伝票
-- ---------------------------------------------------------------------
CREATE TABLE purchase_vouchers (
    id              BIGSERIAL PRIMARY KEY,
    voucher_no      VARCHAR(15) NOT NULL UNIQUE,
    supplier_code   VARCHAR(10) NOT NULL REFERENCES suppliers(code),
    voucher_date    DATE NOT NULL,
    tax_rate        NUMERIC(5,2) NOT NULL,
    staff_code      VARCHAR(10) REFERENCES staff(code),
    remarks         VARCHAR(200),
    subtotal_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_settled      BOOLEAN NOT NULL DEFAULT FALSE, -- 仕入支払更新済みフラグ
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_voucher_lines (
    id              BIGSERIAL PRIMARY KEY,
    voucher_id      BIGINT NOT NULL REFERENCES purchase_vouchers(id) ON DELETE CASCADE,
    line_no         SMALLINT NOT NULL,
    category        VARCHAR(10),
    product_code    VARCHAR(15) REFERENCES products(code),
    product_name    VARCHAR(80) NOT NULL,
    spec            VARCHAR(80),
    unit            VARCHAR(10),
    quantity        NUMERIC(12,3) NOT NULL DEFAULT 0,
    cost_price      NUMERIC(12,2),
    cost_amount     NUMERIC(14,2),
    note            VARCHAR(100),
    UNIQUE(voucher_id, line_no)
);

-- ---------------------------------------------------------------------
-- 9. 入金伝票／支払伝票（手形決済対応）
-- ---------------------------------------------------------------------
CREATE TABLE receipt_vouchers ( -- 入金伝票
    id              BIGSERIAL PRIMARY KEY,
    voucher_no      VARCHAR(15) NOT NULL UNIQUE,
    customer_code   VARCHAR(10) NOT NULL REFERENCES customers(code),
    voucher_date    DATE NOT NULL,
    period_from     DATE,     -- 対象期間（日付範囲）From
    period_to       DATE,     -- 対象期間（日付範囲）To
    billed_amount   NUMERIC(14,2), -- 請求金額
    sales_amount    NUMERIC(14,2), -- 売上金額
    tax_amount      NUMERIC(14,2), -- 消費税
    subtotal_amount NUMERIC(14,2) NOT NULL DEFAULT 0, -- 小計（入金金額合計）
    print_receipt   BOOLEAN NOT NULL DEFAULT FALSE, -- 領収書印刷
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE receipt_voucher_lines (
    id              BIGSERIAL PRIMARY KEY,
    voucher_id      BIGINT NOT NULL REFERENCES receipt_vouchers(id) ON DELETE CASCADE,
    line_no         SMALLINT NOT NULL,
    category        VARCHAR(10),          -- 区分（現金/振込/手形 等）
    amount          NUMERIC(14,2) NOT NULL,
    note            VARCHAR(100),
    bank_code       VARCHAR(10) REFERENCES banks(code),
    bill_due_date   DATE,     -- 手形決済日
    bill_no         VARCHAR(30), -- 手形No
    UNIQUE(voucher_id, line_no)
);

CREATE TABLE payment_vouchers ( -- 支払伝票
    id              BIGSERIAL PRIMARY KEY,
    voucher_no      VARCHAR(15) NOT NULL UNIQUE,
    supplier_code   VARCHAR(10) NOT NULL REFERENCES suppliers(code),
    voucher_date    DATE NOT NULL,
    period_from     DATE,
    period_to       DATE,
    billed_amount   NUMERIC(14,2),
    purchase_amount NUMERIC(14,2),
    tax_amount      NUMERIC(14,2),
    subtotal_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_voucher_lines (
    id              BIGSERIAL PRIMARY KEY,
    voucher_id      BIGINT NOT NULL REFERENCES payment_vouchers(id) ON DELETE CASCADE,
    line_no         SMALLINT NOT NULL,
    category        VARCHAR(10),
    amount          NUMERIC(14,2) NOT NULL,
    note            VARCHAR(100),
    bank_code       VARCHAR(10) REFERENCES banks(code),
    bill_due_date   DATE,
    UNIQUE(voucher_id, line_no)
);

-- ---------------------------------------------------------------------
-- 10. 見積伝票（通常／階層タイプ共通。level で階層表現）
-- ---------------------------------------------------------------------
CREATE TABLE quotations (
    id               BIGSERIAL PRIMARY KEY,
    voucher_no       VARCHAR(15) NOT NULL UNIQUE, -- 伝票番号
    reference_no     VARCHAR(15),                 -- 参照番号
    customer_code    VARCHAR(10) NOT NULL REFERENCES customers(code),
    staff_code       VARCHAR(10) REFERENCES staff(code),
    sub_no           VARCHAR(15),                 -- 補助番号
    quotation_date   DATE NOT NULL,
    counterpart_staff VARCHAR(60),                -- 相手先担当
    project_name1    VARCHAR(60),                 -- 案件名(60)
    project_name2    VARCHAR(60),                 -- 〃(60) 2行目
    delivery_terms   VARCHAR(36),                 -- 納期(36)
    delivery_place   VARCHAR(36),                 -- 受渡場所(36)
    freight_terms    VARCHAR(36),                 -- 荷造運賃(36)
    payment_terms    VARCHAR(36),                 -- 支払条件(36)
    valid_until_text VARCHAR(36),                 -- 有効期限(36)
    remarks          VARCHAR(88),                 -- 備考(88)
    is_hierarchical  BOOLEAN NOT NULL DEFAULT FALSE,
    quote_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    cost_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    gross_profit     NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_calculated   BOOLEAN NOT NULL DEFAULT TRUE,
    created_by       UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quotation_lines (
    id              BIGSERIAL PRIMARY KEY,
    quotation_id    BIGINT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    line_no         SMALLINT NOT NULL,
    level           SMALLINT NOT NULL DEFAULT 0, -- 階層タイプ用の見出しレベル（0=明細,1〜=見出し行）
    category        VARCHAR(10),
    product_code    VARCHAR(15) REFERENCES products(code),
    product_name    VARCHAR(40),
    spec            VARCHAR(40),
    unit            VARCHAR(10),
    quantity        NUMERIC(12,3),
    cost_price      NUMERIC(12,2),
    cost_amount     NUMERIC(14,2),
    quote_price     NUMERIC(12,2),
    quote_amount    NUMERIC(14,2),
    gross_profit    NUMERIC(14,2),
    UNIQUE(quotation_id, line_no)
);

-- ---------------------------------------------------------------------
-- 11. 請求（締め処理）／仕入支払（締め処理）
--     旧: 請求更新／仕入支払更新／請求実績修正／仕入支払実績修正
-- ---------------------------------------------------------------------
CREATE TABLE billing_closings ( -- 請求更新の実行履歴（締め処理1回分）
    id            BIGSERIAL PRIMARY KEY,
    closing_day   SMALLINT NOT NULL,   -- 締日
    as_of_date    DATE NOT NULL,       -- 伝票日付〜（この日まで集計）
    executed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    executed_by   UUID REFERENCES users(id),
    is_reversed   BOOLEAN NOT NULL DEFAULT FALSE -- 請求更新削除で取消された場合
);

CREATE TABLE billing_records ( -- 請求実績（得意先×締め期間のスナップショット。実績修正の対象）
    id                BIGSERIAL PRIMARY KEY,
    closing_id        BIGINT NOT NULL REFERENCES billing_closings(id),
    customer_code     VARCHAR(10) NOT NULL REFERENCES customers(code),
    period_from       DATE,
    period_to         DATE NOT NULL,
    previous_balance  NUMERIC(14,2) NOT NULL DEFAULT 0, -- 前回請求残
    sales_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    receipt_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    billed_amount     NUMERIC(14,2) NOT NULL DEFAULT 0, -- 今回請求額
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_closings ( -- 仕入支払更新の実行履歴
    id            BIGSERIAL PRIMARY KEY,
    closing_day   SMALLINT NOT NULL,
    as_of_date    DATE NOT NULL,
    executed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    executed_by   UUID REFERENCES users(id),
    is_reversed   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE payment_records ( -- 仕入支払実績
    id                BIGSERIAL PRIMARY KEY,
    closing_id        BIGINT NOT NULL REFERENCES payment_closings(id),
    supplier_code     VARCHAR(10) NOT NULL REFERENCES suppliers(code),
    period_from       DATE,
    period_to         DATE NOT NULL,
    previous_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
    purchase_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
    payment_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    payable_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 12. 在庫受払（商品受払台帳のもとになる明細ログ）
-- ---------------------------------------------------------------------
CREATE TABLE inventory_movements (
    id              BIGSERIAL PRIMARY KEY,
    product_code    VARCHAR(15) NOT NULL REFERENCES products(code),
    movement_date   DATE NOT NULL,
    movement_type   VARCHAR(10) NOT NULL, -- 'purchase_in','sales_out','adjust' など
    source_table    VARCHAR(30),           -- 'sales_voucher_lines' 等トレーサビリティ用
    source_id       BIGINT,
    quantity_in     NUMERIC(14,3) NOT NULL DEFAULT 0,
    quantity_out    NUMERIC(14,3) NOT NULL DEFAULT 0,
    unit_cost       NUMERIC(12,4),
    balance_qty     NUMERIC(14,3),  -- 移動後在庫数量
    balance_amount  NUMERIC(14,2),  -- 移動後在庫金額
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 13. 担当者別予算
-- ---------------------------------------------------------------------
CREATE TABLE staff_budgets (
    staff_code   VARCHAR(10) NOT NULL REFERENCES staff(code),
    year_month   CHAR(7) NOT NULL, -- 'YYYY-MM'
    budget_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (staff_code, year_month)
);

-- ---------------------------------------------------------------------
-- 14. システム環境設定（旧: 環境マスター。物理プリンター設定は廃止し、
--     税・丸め・締め日のデフォルト値のみ保持）
-- ---------------------------------------------------------------------
CREATE TABLE company_settings (
    id                    SMALLINT PRIMARY KEY DEFAULT 1,
    company_name          VARCHAR(60) NOT NULL,
    postal_code           VARCHAR(10),
    address1              VARCHAR(100),
    address2              VARCHAR(100),
    phone                 VARCHAR(20),
    fax                   VARCHAR(20),
    invoice_registration_no VARCHAR(20), -- 適格請求書発行事業者登録番号（T+13桁）。実物の請求書に印字されているため追加
    default_closing_day   SMALLINT NOT NULL DEFAULT 31,
    default_tax_method    SMALLINT NOT NULL DEFAULT 0,
    default_calc_method   SMALLINT NOT NULL DEFAULT 0,
    default_rounding      SMALLINT NOT NULL DEFAULT 0,
    cash_customer_code    VARCHAR(10) REFERENCES customers(code), -- 現金売上の既定得意先
    CHECK (id = 1)
);

-- =====================================================================
-- インデックス（検索・レポートで頻出する検索キー）
-- =====================================================================
CREATE INDEX idx_sales_vouchers_customer_date ON sales_vouchers(customer_code, voucher_date);
CREATE INDEX idx_sales_vouchers_staff_date ON sales_vouchers(staff_code, voucher_date);
CREATE INDEX idx_purchase_vouchers_supplier_date ON purchase_vouchers(supplier_code, voucher_date);
CREATE INDEX idx_receipt_vouchers_customer_date ON receipt_vouchers(customer_code, voucher_date);
CREATE INDEX idx_payment_vouchers_supplier_date ON payment_vouchers(supplier_code, voucher_date);
CREATE INDEX idx_quotations_customer_date ON quotations(customer_code, quotation_date);
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);   -- 商品名あいまい検索（商品約14.6万件想定）
CREATE INDEX idx_customers_name_trgm ON customers USING gin (name1 gin_trgm_ops); -- 得意先名あいまい検索
CREATE INDEX idx_inventory_movements_product_date ON inventory_movements(product_code, movement_date);
