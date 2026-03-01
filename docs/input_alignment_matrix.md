# Input Alignment Matrix

## Farmer Inputs (Required by objectives + model attributes)

| Category | Inputs | Where in system |
|---|---|---|
| Farmer profile | `firstName`, `middleInitial`, `lastName`, `age`, `email`, `contactNumber`, `municipality`, `province` | `src/pages/Settings/Settings.jsx` |
| Farm baseline | `farmName`, `farmArea` (ha), `elevation` (m), `plantVariety`, `overallTreeCount` | `src/components/FarmFormModal/FarmFormModal.jsx` |
| Cluster setup | `clusterName`, `areaSize` (sqm), `plantCount`, `plantStage` | `src/components/ClusterFormModal/ClusterFormModal.jsx` |
| Cluster identifiers (traceability) | `farmId`, `clusterId` (read-only view) | `src/pages/ClusterDetail/ClusterDetail.jsx` |
| Growth & climate | `datePlanted`, `numberOfPlants` (synced), `monthlyTemperature`, `rainfall`, `humidity`, `soilPh`, `floodRiskLevel`, `floodEventsCount`, `floodLastEventDate` | `src/pages/ClusterDetail/ClusterDetail.jsx` |
| Management | `fertilizerType`, `fertilizerFrequency`, `pesticideType`, `pesticideFrequency`, `lastPrunedDate`, `shadeTrees` | `src/pages/ClusterDetail/ClusterDetail.jsx` |
| Seasonal/harvest | `harvestDate`, `estimatedHarvestDate`, `harvestSeason`, `previousYield`, `predictedYield`, `currentYield` | `src/pages/ClusterDetail/ClusterDetail.jsx` |
| Quality/grade (no cupping) | `gradeFine`, `gradePremium`, `gradeCommercial`, `beanMoisture`, `beanSizeMm`, `beanScreenSize`, defect percentages | `src/pages/ClusterDetail/ClusterDetail.jsx` |
| Derived metric | `plantAgeYears` (computed from `datePlanted`, shown as years) | `src/pages/ClusterDetail/ClusterDetail.jsx` |

## Admin Inputs

| Category | Inputs | Where in system |
|---|---|---|
| Farmer account administration | `username`, `email`, name fields, `age`, `contact_number`, `municipality`, `province`, `password` (create) | `src/admin/pages/RegisteredFarmers.jsx` |
| Agriclimatic baseline (append-only snapshots) | `monthlyTemperature`, `rainfall`, `humidity`, `soilPh`, `floodRiskLevel` | `src/admin/pages/AgriclimaticSettings.jsx` |

## Data Persistence Alignment

| Requirement | Status | Notes |
|---|---|---|
| Non-overwrite history for stage/harvest | Aligned | Insert snapshot pattern in `cluster_stage_data` and `harvest_records` |
| Admin weather source table | Added | `align_agriclimatic_admin.sql` creates `public.agriclimatic_admin` |
| Flood factors in farmer input | Added | Flood fields are now in cluster Overview section |
| Plant age in years | Aligned | Computed and displayed; model uses years from planted date |
| Model-required identifiers | Aligned | `farm_id` and `cluster_id` passed to model feature mapping |
