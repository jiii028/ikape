-- ============================================================
-- HARVEST - Coffee Farm Management System
-- Supabase PostgreSQL Schema
-- Complete schema matching all codebase functionalities
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS
-- Source: Register.jsx → form fields
--         AuthContext.jsx → register(), fetchProfile(), updateProfile()
--         Settings.jsx → edit profile (firstName, lastName, email,
--                        contactNumber, municipality, province)
--         DashboardLayout.jsx → displays user.firstName, user.lastName,
--                               user.municipality, user.province
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username        VARCHAR(50)  NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,          -- placeholder; Supabase Auth manages real hash
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    middle_initial  VARCHAR(2),
    contact_number  VARCHAR(20)  NOT NULL,
    age             INTEGER      NOT NULL CHECK (age >= 18 AND age <= 120),
    municipality    VARCHAR(150) NOT NULL,
    province        VARCHAR(150) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. FARMS (1 per user — auto-created on first login)
-- Source: FarmContext.jsx → fetchFarmData() auto-creates with farm_name='My Farm'
--         FarmContext.jsx → setFarmInfo() updates farm details
--         FarmFormModal.jsx → farmName, farmArea, elevation, plantVariety,
--                            overallTreeCount
-- ============================================================
CREATE TABLE farms (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    farm_name       VARCHAR(200),                    -- default 'My Farm' on auto-create
    farm_area       DECIMAL(10,2),                   -- hectares
    elevation       DECIMAL(10,2),                   -- meters
    plant_variety   VARCHAR(50),                     -- Arabica | Robusta | Liberica | Excelsa | Mixed
    overall_tree_count INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. CLUSTERS
-- Source: ClusterFormModal.jsx → clusterName, areaSize, plantCount, plantStage
--         FarmContext.jsx → addCluster(), updateCluster(), deleteCluster()
--         Dashboard.jsx → list, count, filter by plantStage
--         HarvestRecords.jsx → filter by plantStage, display plantCount
--         Recommendations.jsx → analyzeCluster() reads all cluster data
-- ============================================================
CREATE TYPE plant_stage AS ENUM (
    'seed-sapling',
    'tree',
    'flowering',
    'ready-to-harvest'
);

CREATE TABLE clusters (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id         UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    cluster_name    VARCHAR(200) NOT NULL,
    area_size       DECIMAL(10,2) NOT NULL,          -- hectares
    plant_count     INTEGER       NOT NULL,
    plant_stage     plant_stage   NOT NULL DEFAULT 'seed-sapling',
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. CLUSTER_STAGE_DATA
-- Source: ClusterDetailModal.jsx → STAGE_FIELDS config (all stage-specific fields)
--         FarmContext.jsx → updateCluster() upserts with onConflict: 'cluster_id'
--                           mapStageDataFromDb() / mapStageDataToDb()
--         HarvestRecords.jsx → reads stageData.variety, .fertilizerType,
--                              .soilPh, .shadeTrees, .harvestSeason,
--                              .previousYield, .predictedYield, .currentYield,
--                              .gradeFine, .gradePremium, .gradeCommercial
--         Recommendations.jsx → analyzeCluster() reads fertilizerType,
--                               pesticideFrequency, lastPrunedDate, soilPh,
--                               shadeTrees, monthlyTemperature, previousYield,
--                               currentYield
-- One row per cluster; upserted as user fills in data
-- ============================================================
CREATE TABLE cluster_stage_data (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cluster_id              UUID NOT NULL UNIQUE REFERENCES clusters(id) ON DELETE CASCADE,

    -- ─── Common fields (all stages: seed-sapling, tree, flowering, ready-to-harvest) ───
    date_planted            DATE,
    number_of_plants        INTEGER,
    variety                 VARCHAR(100),
    fertilizer_frequency    VARCHAR(200),
    fertilizer_type         VARCHAR(200),
    pesticide_type          VARCHAR(200),
    pesticide_frequency     VARCHAR(200),
    monthly_temperature     DECIMAL(5,2),            -- °C
    rainfall                DECIMAL(8,2),            -- mm
    humidity                DECIMAL(5,2),            -- %
    soil_ph                 DECIMAL(4,2),

    -- ─── Tree / Flowering / Ready-to-Harvest fields ────────────────────
    last_harvested_date     DATE,
    previous_yield          DECIMAL(10,2),           -- kg
    last_pruned_date        DATE,
    shade_trees             VARCHAR(3),              -- 'Yes' or 'No'

    -- ─── Flowering-specific ────────────────────────────────────────────
    estimated_flowering_date DATE,

    -- ─── Ready-to-Harvest: core harvest fields ────────────────────────
    harvest_date            DATE,
    predicted_yield         DECIMAL(10,2),           -- kg
    harvest_season          VARCHAR(100),            -- e.g. '2025 Wet Season'
    current_yield           DECIMAL(10,2),           -- kg (actual)
    grade_fine              DECIMAL(5,2),            -- %
    grade_premium           DECIMAL(5,2),            -- %
    grade_commercial        DECIMAL(5,2),            -- %
    estimated_harvest_date  DATE,

    -- ─── Ready-to-Harvest: Pre-Harvest Monitoring ─────────────────────
    pre_last_harvest_date   DATE,
    pre_total_trees         INTEGER,
    pre_yield_kg            DECIMAL(10,2),           -- kg
    pre_grade_fine          DECIMAL(10,2),           -- kg
    pre_grade_premium       DECIMAL(10,2),           -- kg
    pre_grade_commercial    DECIMAL(10,2),           -- kg

    -- ─── Ready-to-Harvest: Post-Harvest Monitoring ────────────────────
    post_current_yield      DECIMAL(10,2),           -- kg
    post_grade_fine         DECIMAL(5,2),            -- %
    post_grade_premium      DECIMAL(5,2),            -- %
    post_grade_commercial   DECIMAL(5,2),            -- %
    defect_count            INTEGER,
    bean_moisture           DECIMAL(5,2),            -- %
    bean_screen_size        VARCHAR(50),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. HARVEST_RECORDS
-- Source: FarmContext.jsx → addHarvestRecord(clusterId, record)
--         record fields: season, yieldKg, gradeFine, gradePremium,
--                        gradeCommercial, notes
-- Historical harvest entries per cluster (separate from stage_data)
-- ============================================================
CREATE TABLE harvest_records (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cluster_id      UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    season          VARCHAR(100),
    yield_kg        DECIMAL(10,2),
    grade_fine      DECIMAL(5,2),
    grade_premium   DECIMAL(5,2),
    grade_commercial DECIMAL(5,2),
    notes           TEXT,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES for query performance
-- ============================================================
CREATE INDEX idx_farms_user_id ON farms(user_id);
CREATE INDEX idx_clusters_farm_id ON clusters(farm_id);
CREATE INDEX idx_clusters_plant_stage ON clusters(plant_stage);
CREATE INDEX idx_cluster_stage_data_cluster_id ON cluster_stage_data(cluster_id);
CREATE INDEX idx_harvest_records_cluster_id ON harvest_records(cluster_id);
CREATE INDEX idx_harvest_records_recorded_at ON harvest_records(recorded_at);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_farms_updated_at
    BEFORE UPDATE ON farms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clusters_updated_at
    BEFORE UPDATE ON clusters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cluster_stage_data_updated_at
    BEFORE UPDATE ON cluster_stage_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY (Supabase Auth)
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_stage_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvest_records ENABLE ROW LEVEL SECURITY;

-- ── Users policies ──────────────────────────────────────────
-- Insert: during registration (AuthContext.jsx register())
CREATE POLICY "Users can insert own profile"
    ON users FOR INSERT
    WITH CHECK (id = auth.uid());

-- Select: fetchProfile(), login username lookup
CREATE POLICY "Users can view own profile"
    ON users FOR SELECT
    USING (id = auth.uid());

-- Update: Settings.jsx → updateProfile()
CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    USING (id = auth.uid());

-- ── Allow username lookup for login (anyone can search by username to get email) ──
-- Source: AuthContext.jsx login() — looks up email by username for non-@ identifiers
CREATE POLICY "Allow username lookup for login"
    ON users FOR SELECT
    USING (true);
-- NOTE: This broader SELECT replaces the above "Users can view own profile" policy.
-- If you want tighter security, use a Supabase Edge Function for login lookup instead
-- and keep only the auth.uid() SELECT policy. For now, only username+email columns are
-- queried by the client (.select('email').eq('username', identifier)).

-- ── Farm policies ───────────────────────────────────────────
-- ALL: fetchFarmData() SELECT, auto-create INSERT, setFarmInfo() UPDATE
CREATE POLICY "Users can manage own farm"
    ON farms FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ── Cluster policies ────────────────────────────────────────
-- ALL: addCluster() INSERT, updateCluster() UPDATE, deleteCluster() DELETE,
--      fetchFarmData() SELECT with cluster_stage_data(*)
CREATE POLICY "Users can manage own clusters"
    ON clusters FOR ALL
    USING (farm_id IN (SELECT id FROM farms WHERE user_id = auth.uid()))
    WITH CHECK (farm_id IN (SELECT id FROM farms WHERE user_id = auth.uid()));

-- ── Stage data policies ─────────────────────────────────────
-- ALL: updateCluster() UPSERT with onConflict: 'cluster_id'
--      fetchFarmData() SELECT via cluster_stage_data(*)
CREATE POLICY "Users can manage own cluster stage data"
    ON cluster_stage_data FOR ALL
    USING (cluster_id IN (
        SELECT c.id FROM clusters c
        JOIN farms f ON c.farm_id = f.id
        WHERE f.user_id = auth.uid()
    ))
    WITH CHECK (cluster_id IN (
        SELECT c.id FROM clusters c
        JOIN farms f ON c.farm_id = f.id
        WHERE f.user_id = auth.uid()
    ));

-- ── Harvest record policies ─────────────────────────────────
-- ALL: addHarvestRecord() INSERT, future SELECT for history
CREATE POLICY "Users can manage own harvest records"
    ON harvest_records FOR ALL
    USING (cluster_id IN (
        SELECT c.id FROM clusters c
        JOIN farms f ON c.farm_id = f.id
        WHERE f.user_id = auth.uid()
    ))
    WITH CHECK (cluster_id IN (
        SELECT c.id FROM clusters c
        JOIN farms f ON c.farm_id = f.id
        WHERE f.user_id = auth.uid()
    ));