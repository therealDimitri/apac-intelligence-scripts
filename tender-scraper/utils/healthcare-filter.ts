/**
 * Healthcare keyword filtering for tender results
 */

const HEALTHCARE_KEYWORDS = [
  // Clinical
  'health',
  'hospital',
  'medical',
  'clinical',
  'patient',
  'healthcare',
  'pathology',
  'radiology',
  'pharmacy',
  'nursing',
  'mental health',
  'aged care',
  'disability',
  'ambulance',
  'emergency',
  'surgery',
  'diagnostic',
  'laboratory',
  'specimen',
  'blood',
  'imaging',
  'oncology',
  'cardiology',

  // Digital Health
  'ehr',
  'electronic health',
  'emr',
  'digital health',
  'telehealth',
  'telemedicine',
  'health information',
  'hit',
  'hie',
  'interoperability',
  'fhir',
  'hl7',

  // Medical equipment
  'medical device',
  'medical equipment',
  'clinical system',
  'patient management',
  'hospital information',

  // Specific to APAC clients
  'harris',
  'dedalus',
  'meditech',
  'cerner',
  'epic',
]

export function isHealthcareRelated(title: string, description?: string | null): boolean {
  const text = `${title} ${description || ''}`.toLowerCase()
  return HEALTHCARE_KEYWORDS.some(keyword => text.includes(keyword.toLowerCase()))
}

export function getMatchedKeywords(title: string, description?: string | null): string[] {
  const text = `${title} ${description || ''}`.toLowerCase()
  return HEALTHCARE_KEYWORDS.filter(keyword => text.includes(keyword.toLowerCase()))
}
