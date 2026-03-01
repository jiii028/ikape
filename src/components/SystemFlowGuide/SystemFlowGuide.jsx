import { createElement } from 'react'
import { Cog, Database, Lightbulb, TrendingUp } from 'lucide-react'

const FLOW_MAP = {
  monitoring: {
    title: 'How Farm Monitoring Works',
    subtitle: 'Input, processing flow, and system outputs for farmer records.',
    input: [
      'Profile, farm, and cluster identifiers/details',
      'Stage updates: weather, flood risk, soil, management, growth status',
      'Harvest values: yield, grades, defects, bean quality',
    ],
    process: [
      'Frontend validates required fields and value formats',
      'Records are saved through Supabase with access policies',
      'Stage/harvest records are stored as history snapshots',
    ],
    output: [
      'Updated dashboards and trend charts',
      'Latest cluster condition and quality indicators',
      'Data context used for recommendations and forecasts',
    ],
  },
  prediction: {
    title: 'How Prediction Works',
    subtitle: 'From model feature inputs to yield and grade forecasts.',
    input: [
      'Farm and cluster context (farm_id, cluster_id)',
      'Crop management, weather, soil, and defect factors',
      'Bean quality fields (screen size, moisture, defects)',
    ],
    process: [
      'Feature normalization and model-ready mapping',
      'Batch/single inference through prediction API',
      'Grade percentages normalized and labeled',
    ],
    output: [
      'Predicted yield in kg',
      'Predicted Fine / Premium / Commercial percentages',
      'Dominant grade with interpretation label',
    ],
  },
  decision: {
    title: 'How Decision Support Works',
    subtitle: 'How cluster-level recommendations are generated.',
    input: [
      'Latest cluster stage and harvest data',
      'PNS-related quality and defect indicators',
      'Location, season, and trend context',
    ],
    process: [
      'Rule checks evaluate risk and quality status',
      'Priority scoring highlights urgent interventions',
      'Cluster findings are summarized into actionable guidance',
    ],
    output: [
      'Tailored recommendation messages per cluster',
      'Risk and compliance alerts',
      'Suggested management timing and focus actions',
    ],
  },
}

function FlowColumn({ icon, label, items }) {
  return (
    <article className="system-flow-column">
      <header className="system-flow-column-header">
        {createElement(icon, { size: 16 })}
        <h4>{label}</h4>
      </header>
      <ul className="system-flow-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  )
}

export default function SystemFlowGuide({ mode = 'monitoring' }) {
  const flow = FLOW_MAP[mode] || FLOW_MAP.monitoring

  return (
    <section className="system-flow-card" aria-label={`${flow.title} guide`}>
      <div className="system-flow-head">
        <h3>{flow.title}</h3>
        <p>{flow.subtitle}</p>
      </div>
      <div className="system-flow-grid">
        <FlowColumn icon={Database} label="Input" items={flow.input} />
        <FlowColumn icon={Cog} label="Process" items={flow.process} />
        <FlowColumn icon={mode === 'decision' ? Lightbulb : TrendingUp} label="Output" items={flow.output} />
      </div>
    </section>
  )
}
