const DEFECT_LIMITS = {
  defectBlackPct: {
    label: 'Black Bean',
    extraMaxExclusive: 4,
    class1MinInclusive: 4,
    class1MaxInclusive: 6,
    class2MaxInclusive: 15,
  },
  defectMoldInfestedPct: {
    label: 'Moldy/Infested Bean',
    extraMaxExclusive: 5,
    class1MinInclusive: 5,
    class1MaxInclusive: 6,
    class2MaxInclusive: 8,
  },
  defectImmaturePct: {
    label: 'Immature Bean',
    extraMaxExclusive: 2,
    class1MinInclusive: 2,
    class1MaxInclusive: 3,
    class2MaxInclusive: 8,
  },
  defectBrokenPct: {
    label: 'Broken Bean',
    extraMaxExclusive: 3,
    class1MinInclusive: 3,
    class1MaxInclusive: 5,
    class2MaxInclusive: 10,
  },
  defectDriedCherriesPct: {
    label: 'Dried Cherries',
    extraMaxExclusive: 0.5,
    class1MinInclusive: 0.5,
    class1MaxInclusive: 1,
    class2MaxInclusive: 2,
  },
  defectForeignMatterPct: {
    label: 'Foreign Matter',
    extraMaxExclusive: 1,
    class1MinInclusive: 1,
    class1MaxInclusive: 1.5,
    class2MaxInclusive: 2,
  },
}

const PNS_TOTAL_DEFECT_LIMIT = {
  extra: 7,
  class1: 15,
  class2: 25,
}

const CLASS_RANK = {
  extra: 0,
  class1: 1,
  class2: 2,
  reject: 3,
}

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function classifyDefectField(value, limits) {
  if (value === null) return { className: 'extra', message: null }
  if (value < limits.extraMaxExclusive) return { className: 'extra', message: null }
  if (value >= limits.class1MinInclusive && value <= limits.class1MaxInclusive) {
    return { className: 'class1', message: null }
  }
  if (value > limits.class1MaxInclusive && value <= limits.class2MaxInclusive) {
    return { className: 'class2', message: null }
  }
  return {
    className: 'reject',
    message: `${limits.label}: ${value}% exceeds Class II maximum (${limits.class2MaxInclusive}%).`,
  }
}

function getMaxClass(classA, classB) {
  return CLASS_RANK[classA] >= CLASS_RANK[classB] ? classA : classB
}

function classifyBeanSize(beanSizeMm) {
  const value = toNumber(beanSizeMm)
  if (value === null) return ''
  if (value >= 7.5) return 'extra large'
  if (value >= 7) return 'large'
  if (value >= 6.5) return 'medium'
  if (value >= 6) return 'small'
  return 'extra small'
}

export function evaluatePnsCompliance(stageData = {}) {
  const moisture = toNumber(stageData.beanMoisture)
  const moistureCompliant = moisture === null || moisture <= 13

  const defectValues = Object.keys(DEFECT_LIMITS).reduce((acc, key) => {
    acc[key] = toNumber(stageData[key]) || 0
    return acc
  }, {})

  const calculatedTotalDefects = Object.values(defectValues).reduce((sum, value) => sum + value, 0)
  const explicitTotal = toNumber(stageData.pnsTotalDefectsPct)
  const totalDefectsPct = explicitTotal !== null ? explicitTotal : calculatedTotalDefects

  let derivedClass = 'extra'
  const messages = []

  for (const [key, limits] of Object.entries(DEFECT_LIMITS)) {
    const result = classifyDefectField(defectValues[key], limits)
    derivedClass = getMaxClass(derivedClass, result.className)
    if (result.message) messages.push(result.message)
  }

  let totalClass = 'extra'
  if (totalDefectsPct <= PNS_TOTAL_DEFECT_LIMIT.extra) {
    totalClass = 'extra'
  } else if (totalDefectsPct <= PNS_TOTAL_DEFECT_LIMIT.class1) {
    totalClass = 'class1'
  } else if (totalDefectsPct <= PNS_TOTAL_DEFECT_LIMIT.class2) {
    totalClass = 'class2'
  } else {
    totalClass = 'reject'
    messages.push(
      `Total defects ${totalDefectsPct.toFixed(2)}% exceed Class II limit (${PNS_TOTAL_DEFECT_LIMIT.class2}%).`
    )
  }

  derivedClass = getMaxClass(derivedClass, totalClass)

  if (!moistureCompliant && moisture !== null) {
    messages.push(`Moisture ${moisture}% exceeds PNS limit of 13%.`)
  }

  const complianceStatus =
    moistureCompliant && derivedClass !== 'reject' ? 'Compliant' : 'Non-Compliant'

  const beanSizeMm = toNumber(stageData.beanSizeMm)
  const beanSizeClass = classifyBeanSize(beanSizeMm)

  const qualityClassLabel =
    derivedClass === 'extra'
      ? 'Extra Class'
      : derivedClass === 'class1'
        ? 'Class I'
        : derivedClass === 'class2'
          ? 'Class II'
          : 'Rejected'

  return {
    moisture,
    moistureCompliant,
    totalDefectsPct,
    calculatedTotalDefects,
    qualityClass: qualityClassLabel,
    classKey: derivedClass,
    complianceStatus,
    beanSizeMm,
    beanSizeClass,
    messages,
  }
}
