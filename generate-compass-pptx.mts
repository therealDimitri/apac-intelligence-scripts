/**
 * APAC Compass 2026 Survey Results — PPTX Generator
 *
 * Uses pptx-automizer to clone slides from the official Altera_Library_2026.pptx
 * template, preserving all design elements (shadows, gradients, brand assets),
 * then replaces text/chart/table data.
 *
 * Usage: npx tsx scripts/generate-compass-pptx.mts [--year 2026]
 */

import { Automizer, modify } from 'pptx-automizer'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

// ─── Configuration ────────────────────────────────────────────────────────────

const YEAR = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--year') || '2026')

// Auto-detect OneDrive template path
function findTemplatePath(): string {
  const cloudStorage = join(process.env.HOME || '', 'Library/CloudStorage')
  if (!existsSync(cloudStorage)) throw new Error('CloudStorage not found')
  const dirs = readdirSync(cloudStorage).filter(d => d.startsWith('OneDrive-Altera'))
  if (dirs.length === 0) throw new Error('OneDrive-Altera* not found')
  const path = join(cloudStorage, dirs[0], 'Marketing - Altera Templates & Tools/Altera_Library_2026.pptx')
  if (!existsSync(path)) throw new Error(`Template not found: ${path}`)
  return path
}

const TEMPLATE_PATH = findTemplatePath()
const OUTPUT_DIR = join(__dirname, '..', 'public', 'exports')
const OUTPUT_FILE = `APAC-Compass-${YEAR}-Survey-Results.pptx`

// Slide numbers in the template (1-indexed)
const SLIDES = {
  title: 32,
  kpi: 133,
  sessions: 53,
  pacing: 75,
  keep: 78,
  narrative: 112,
  verbatim: 80,
  closer: 174,
} as const

// Brand colours (no # prefix for pptx-automizer)
const BRAND = {
  INDIGO: '383392',
  NAVY: '151744',
  CORAL: 'F56E7B',
  TEAL: '00BBBA',
  BLUE: '0076A2',
  VIOLET: '707CF1',
  WHITE: 'FFFFFF',
  LIGHT_BG: 'EEEDF5',
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

interface SurveyData {
  id: string
  year: number
  title: string
  location: string | null
  date_start: string | null
  date_end: string | null
  nps_score: number | null
  mean_recommend: number | null
  ai_narrative: string | null
  ai_recommendations: any[] | null
}

interface ResponseData {
  respondent_name: string
  recommend_score: number
  mid_year_interest: boolean
  is_first_time: boolean
  session_ratings: Record<string, string>
  outcome_ratings: Record<string, string>
  day_pacing: Record<string, string>
  day_pacing_reasons: Record<string, string> | null
  venue_ratings: Record<string, string>
  keep_for_next_year: string[]
  session_reasons: string | null
  change_one_thing: string | null
  other_comments: string | null
}

async function fetchData(): Promise<{ survey: SurveyData; responses: ResponseData[] }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase credentials in .env.local')

  const supabase = createClient(url, key)

  const { data: survey, error: sErr } = await supabase
    .from('compass_surveys')
    .select('*')
    .eq('year', YEAR)
    .single()

  if (sErr || !survey) throw new Error(`No survey found for ${YEAR}: ${sErr?.message}`)

  const { data: responses, error: rErr } = await supabase
    .from('compass_responses')
    .select('*')
    .eq('survey_id', survey.id)
    .order('created_at')

  if (rErr) throw new Error(`Failed to fetch responses: ${rErr.message}`)

  return { survey: survey as SurveyData, responses: (responses || []) as ResponseData[] }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeNPS(responses: ResponseData[]) {
  const total = responses.length
  const promoters = responses.filter(r => r.recommend_score >= 9).length
  const passives = responses.filter(r => r.recommend_score >= 7 && r.recommend_score <= 8).length
  const detractors = responses.filter(r => r.recommend_score <= 6).length
  const score = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0
  return { total, promoters, passives, detractors, score }
}

function ratingToValue(rating: string): number {
  const map: Record<string, number> = {
    'Very Relevant': 5, 'Relevant': 4, 'Good': 4, 'Somewhat Relevant': 3,
    'Not Very Relevant': 2, 'Not Relevant': 1,
    'Strongly Agree': 5, 'Agree': 4, 'Neutral': 3, 'Disagree': 2, 'Strongly Disagree': 1,
    'Excellent': 5, 'Good ': 4, 'Average': 3, 'Below Average': 2, 'Poor': 1,
    'Perfect': 5, 'Slightly too packed': 4, 'Too packed': 3, 'Slightly too relaxed': 4, 'Too relaxed': 3,
    'Yes': 1, 'No': 0, 'Maybe': 0.5,
  }
  return map[rating.trim()] ?? 3
}

function avgRating(responses: ResponseData[], field: keyof ResponseData, key: string): number {
  const vals = responses
    .map(r => {
      const obj = r[field] as Record<string, string> | null
      return obj?.[key] ? ratingToValue(obj[key]) : null
    })
    .filter((v): v is number => v !== null)
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

function countRating(responses: ResponseData[], field: keyof ResponseData, key: string, target: string): number {
  return responses.filter(r => {
    const obj = r[field] as Record<string, string> | null
    return obj?.[key]?.trim() === target
  }).length
}

function countPacing(responses: ResponseData[], dayKey: string, keyword: string): number {
  return responses.filter(r => {
    const val = r.day_pacing?.[dayKey]?.toLowerCase() || ''
    return val.startsWith(keyword.toLowerCase())
  }).length
}

function shortenSession(name: string): string {
  return name
    .replace(/^Rate your experience.*?:\s*/, '')
    .replace(/^Session:\s*/, '')
    .replace(/\s*\(.*?\)\s*$/, '')
    // Strip presenter names: "Topic - Person Name" → "Topic"
    .replace(/\s*[-–—]\s*[A-Z][a-z]+ [A-Z].*$/, '')
    // Also handle ": Topic" prefix removal and "& Person" suffixes
    .replace(/,\s*[A-Z][a-z]+ [A-Z].*$/, '')
    .trim()
}

function shortenOutcome(name: string): string {
  return name
    .replace(/^(I |The |This )/, '')
    .replace(/\.$/, '')
    .trim()
}

// ─── PPTX Generation ─────────────────────────────────────────────────────────

async function generate() {
  console.log(`Fetching Compass ${YEAR} data from Supabase...`)
  const { survey, responses } = await fetchData()
  const nps = computeNPS(responses)

  console.log(`  ${responses.length} responses, NPS ${nps.score >= 0 ? '+' : ''}${nps.score}`)

  const templateBuffer = readFileSync(TEMPLATE_PATH)

  const automizer = new Automizer({
    templateDir: '/tmp',
    outputDir: OUTPUT_DIR,
    removeExistingSlides: true,
    cleanup: true,
    autoImportSlideMasters: false,
  })

  const pres = automizer
    .loadRoot(templateBuffer)
    .load(templateBuffer, 'lib')

  // ── Slide 1: Title ────────────────────────────────────────────────────────
  pres.addSlide('lib', SLIDES.title, (slide) => {
    slide.modifyElement('Title 1', [
      modify.setText(`APAC Compass ${YEAR}\nSurvey Results`),
    ])
    slide.modifyElement('Subtitle 2', [
      modify.setText(`${survey.location || 'Leadership Offsite'} · ${responses.length} Responses`),
    ])
    slide.modifyElement('Text Placeholder 3', [
      modify.setText(formatDateRange(survey.date_start, survey.date_end)),
    ])
  })

  // ── Slide 2: KPI Dashboard (4 doughnut charts) ───────────────────────────
  const midYes = responses.filter(r => r.mid_year_interest).length
  const meanRec = survey.mean_recommend || (responses.reduce((s, r) => s + r.recommend_score, 0) / responses.length)

  pres.addSlide('lib', SLIDES.kpi, (slide) => {
    slide.modifyElement('Title 1', [
      modify.setText(`Key Metrics — ${responses.length} Responses`),
    ])

    // 4 doughnut charts: NPS, Mean Recommend, Mid-Year Interest, First-Timers
    // All named "Content Placeholder 3" with nameIdx 0-3
    const firstTimers = responses.filter(r => r.is_first_time).length

    // Chart 0: NPS Score (out of 200 range: -100 to +100)
    slide.modifyElement({ name: 'Content Placeholder 3', nameIdx: 0 }, [
      modify.setChartData({
        series: [{ label: 'NPS' }],
        categories: [
          { label: 'Score', values: [Math.max(0, nps.score)] },
          { label: 'Remaining', values: [100 - Math.max(0, nps.score)] },
        ],
      }),
    ])

    // Chart 1: Mean Recommend (out of 10)
    slide.modifyElement({ name: 'Content Placeholder 3', nameIdx: 1 }, [
      modify.setChartData({
        series: [{ label: 'Score' }],
        categories: [
          { label: 'Score', values: [Math.round(meanRec * 10)] },
          { label: 'Remaining', values: [100 - Math.round(meanRec * 10)] },
        ],
      }),
    ])

    // Chart 2: Mid-Year Interest
    slide.modifyElement({ name: 'Content Placeholder 3', nameIdx: 2 }, [
      modify.setChartData({
        series: [{ label: 'Interest' }],
        categories: [
          { label: 'Yes', values: [midYes] },
          { label: 'No', values: [responses.length - midYes] },
        ],
      }),
    ])

    // Chart 3: First-Timers
    slide.modifyElement({ name: 'Content Placeholder 3', nameIdx: 3 }, [
      modify.setChartData({
        series: [{ label: 'First Time' }],
        categories: [
          { label: 'Yes', values: [firstTimers] },
          { label: 'No', values: [responses.length - firstTimers] },
        ],
      }),
    ])

    // Big number labels (overlaid on charts)
    slide.modifyElement('TextBox 24', [modify.setText(`+${nps.score}`)])
    slide.modifyElement('TextBox 25', [modify.setText(`${meanRec.toFixed(1)}`)])
    slide.modifyElement('TextBox 26', [modify.setText(`${Math.round((midYes / responses.length) * 100)}%`)])
    slide.modifyElement('TextBox 27', [modify.setText(`${firstTimers}`)])

    // Detail labels below charts
    slide.modifyElement('TextBox 5', [modify.setText(
      `NPS Score\n${nps.promoters} promoters · ${nps.passives} passive · ${nps.detractors} detractors`
    )])
    slide.modifyElement('TextBox 6', [modify.setText(
      `Mean Recommend\n${meanRec.toFixed(1)} out of 10`
    )])
    slide.modifyElement('TextBox 7', [modify.setText(
      `Mid-Year Interest\n${midYes} of ${responses.length} want a mid-year session`
    )])
    slide.modifyElement('TextBox 28', [modify.setText(
      `First-Timers\n${firstTimers} of ${responses.length} attending for first time`
    )])
  })

  // ── Slide 3: Session Ratings Table ────────────────────────────────────────
  const sessionKeys = responses.length > 0 ? Object.keys(responses[0].session_ratings || {}) : []

  pres.addSlide('lib', SLIDES.sessions, (slide) => {
    slide.modifyElement('Title 1', [modify.setText('Session Ratings')])
    slide.modifyElement('Text Placeholder 2', [
      modify.setText(`How relevant was each session? · ${responses.length} responses`),
    ])

    // Build table: header + rows for each session
    // Actual rating values: Very Relevant, Good, Not Relevant, Didn't Attend
    // Drop "Didn't Attend" column (sparse) to save space
    const ratingBuckets = ['Very Relevant', 'Good', 'Not Relevant']
    const SMALL: import('pptx-automizer').TableRowStyle = { size: 900 }
    const HEADER: import('pptx-automizer').TableRowStyle = { size: 900, isBold: true }

    const body: import('pptx-automizer').TableRow[] = [
      {
        values: ['Session', ...ratingBuckets, 'Avg'],
        styles: Array(ratingBuckets.length + 2).fill(HEADER),
      },
    ]

    const dataRows = sessionKeys.map(key => {
      const counts = ratingBuckets.map(bucket => countRating(responses, 'session_ratings', key, bucket))
      const avg = avgRating(responses, 'session_ratings', key)
      return {
        values: [
          shortenSession(key),
          ...counts.map(c => c > 0 ? `${c} (${Math.round(c / responses.length * 100)}%)` : '–'),
          avg.toFixed(1),
        ] as (string | number)[],
        styles: Array(ratingBuckets.length + 2).fill(SMALL),
        _avg: avg,
      }
    })

    // Sort by average rating descending
    dataRows.sort((a, b) => b._avg - a._avg)
    body.push(...dataRows.map(({ values, styles }) => ({ values, styles })))

    slide.modifyElement('Content Placeholder 4', [
      modify.setTable(
        { body },
        { adjustHeight: true, adjustWidth: true },
      ),
    ])
  })

  // ── Slide 4: Day Pacing ───────────────────────────────────────────────────
  const dayKeys = responses.length > 0 ? Object.keys(responses[0].day_pacing || {}) : []

  // Icon center points on the pacing slide (one per card)
  // Original icons: Picture 10 (Day1), Picture 13 (Day2), Picture 12 (Day3)
  const ICON_CENTERS = [
    { cx: 1572781, cy: 1902619 }, // Day 1 card center
    { cx: 3573772, cy: 1883240 }, // Day 2 card center
    { cx: 5579933, cy: 1883240 }, // Day 3 card center
  ]
  // Thematic icons with their native dimensions from the template:
  // Day 1: Clock (slide 137, Graphic 35) — 462280×462280 (square)
  // Day 2: Lightbulb (slide 109, Graphic 66) — 381000×419100
  // Day 3: Bar chart + people (slide 137, Graphic 48) — 511810×462280
  const PACING_ICONS = [
    { slide: 137, name: 'Graphic 35', w: 462280, h: 462280 },
    { slide: 109, name: 'Graphic 66', w: 381000, h: 419100 },
    { slide: 137, name: 'Graphic 48', w: 511810, h: 462280 },
  ]

  pres.addSlide('lib', SLIDES.pacing, (slide) => {
    slide.modifyElement('Title 1', [modify.setText('Day Pacing')])

    // Remove the 4 identical template icons
    slide.removeElement('Picture 10')
    slide.removeElement('Picture 11')
    slide.removeElement('Picture 12')
    slide.removeElement('Picture 13')

    // Import thematic icons from other template slides, centered at card positions
    dayKeys.forEach((_, i) => {
      if (i >= 3 || !PACING_ICONS[i]) return
      const icon = PACING_ICONS[i]
      const center = ICON_CENTERS[i]
      // Position icon centered at the card's icon area, using native dimensions
      slide.addElement('lib', icon.slide, icon.name, [
        modify.setPosition({
          x: center.cx - Math.round(icon.w / 2),
          y: center.cy - Math.round(icon.h / 2),
          w: icon.w,
          h: icon.h,
        }),
      ])
    })

    // 4 content rectangles (Rectangle 3-6), one per day
    // Day pacing values are verbose: "Perfect - appropriate amount and pacing"
    const pacingKeywords = ['Perfect', 'Slightly too much', 'Too much', 'Not enough', "Didn't attend"]

    dayKeys.forEach((dayKey, i) => {
      if (i >= 4) return // Template has 4 cards max
      const rectName = `Rectangle ${3 + i}`
      const perfectCount = countPacing(responses, dayKey, 'Perfect')
      const respondedCount = responses.filter(r => r.day_pacing?.[dayKey] && !r.day_pacing[dayKey].toLowerCase().startsWith("didn't")).length
      const perfectPct = respondedCount > 0 ? Math.round((perfectCount / respondedCount) * 100) : 0

      const lines = [
        dayKey.replace(/^Day\s*/, 'Day '),
        '',
        `${perfectPct}% Perfect`,
        `${perfectCount} of ${respondedCount} who attended`,
        '',
        ...pacingKeywords.filter(k => k !== 'Perfect').map(kw => {
          const cnt = countPacing(responses, dayKey, kw)
          return cnt > 0 ? `${kw}: ${cnt}` : ''
        }).filter(Boolean),
      ]

      slide.modifyElement(rectName, [modify.setText(lines.join('\n'))])
    })

    // Clear unused cards and their accent bars if fewer than 4 days
    for (let i = dayKeys.length; i < 4; i++) {
      slide.removeElement(`Rectangle ${3 + i}`)
      slide.removeElement(`Rectangle ${7 + i}`)
    }
  })

  // ── Slide 5: Keep for 2027 ────────────────────────────────────────────────
  const keepTally = new Map<string, number>()
  for (const r of responses) {
    for (const item of (r.keep_for_next_year || [])) {
      keepTally.set(item, (keepTally.get(item) || 0) + 1)
    }
  }
  const keepSorted = [...keepTally.entries()].sort((a, b) => b[1] - a[1])

  pres.addSlide('lib', SLIDES.keep, (slide) => {
    slide.modifyElement('Title 1', [modify.setText('Keep for Next Year')])

    // 3 groups (Group 2, 5, 8) — each has a header pill and body rectangle
    const groupNames = ['Group 2', 'Group 5', 'Group 8']
    const chunks = chunkArray(keepSorted, 3) // Split into 3 groups

    groupNames.forEach((groupName, gi) => {
      const items = chunks[gi] || []
      const bodyText = items
        .map(([item, count]) => `${item}: ${count} of ${responses.length} (${Math.round(count / responses.length * 100)}%)`)
        .join('\n')

      // Use raw XML callback for grouped shapes
      slide.modifyElement(groupName, (element: Element) => {
        // Find all text bodies within the group
        const textBodies = element.getElementsByTagName('a:t')
        let bodyIdx = 0
        for (let t = 0; t < textBodies.length; t++) {
          const node = textBodies[t]
          const text = node.textContent || ''
          // First text element in group is usually the header pill
          if (bodyIdx === 0) {
            const headers = ['Top Picks', 'Popular Choices', 'Also Mentioned']
            node.textContent = headers[gi] || `Group ${gi + 1}`
            bodyIdx++
          } else if (bodyIdx === 1) {
            // Body content
            node.textContent = bodyText || 'No items'
            bodyIdx++
          }
        }
      })
    })

    // Takeaway boxes (Rectangle 13-15)
    const takeaways = [
      keepSorted[0] ? `${keepSorted[0][0]} was the #1 pick` : '',
      keepSorted.length > 0 ? `${keepSorted.filter(([, c]) => c >= responses.length * 0.5).length} items chosen by 50%+` : '',
      `${keepSorted.length} unique items mentioned`,
    ]
    for (let i = 0; i < 3; i++) {
      slide.modifyElement(`Rectangle ${13 + i}`, [modify.setText(takeaways[i])])
    }
  })

  // ── Slide 6: AI Narrative ─────────────────────────────────────────────────
  const narrativeParts = parseNarrative(survey.ai_narrative || '')

  pres.addSlide('lib', SLIDES.narrative, (slide) => {
    slide.modifyElement('Title 1', [modify.setText('Executive Summary')])

    // 4 numbered ovals (Oval 7-10)
    const ovalLabels = ['01', '02', '03', '04']
    ovalLabels.forEach((label, i) => {
      slide.modifyElement(`Oval ${7 + i}`, [modify.setText(label)])
    })

    // 4 heading textboxes (TextBox 2-5)
    const headings = ['The Headline', 'What Worked', 'The Surprise', 'The Risk']
    headings.forEach((heading, i) => {
      slide.modifyElement(`TextBox ${2 + i}`, [modify.setText(heading)])
    })

    // 4 body rectangles (Rectangle 6, 11-13)
    const bodyRects = ['Rectangle 6', 'Rectangle 11', 'Rectangle 12', 'Rectangle 13']
    bodyRects.forEach((rect, i) => {
      slide.modifyElement(rect, [modify.setText(narrativeParts[i] || '')])
    })
  })

  // ── Slide 7: Verbatim Quote ───────────────────────────────────────────────
  // Pick the most impactful verbatim response
  const bestVerbatim = pickBestVerbatim(responses)

  pres.addSlide('lib', SLIDES.verbatim, (slide) => {
    const quote = bestVerbatim.change_one_thing || bestVerbatim.session_reasons || bestVerbatim.other_comments || ''
    const attribution = `— ${bestVerbatim.respondent_name}${bestVerbatim.is_first_time ? ' (First-Timer)' : ''}`
    slide.modifyElement('Text Placeholder 1', [
      modify.setText(`"${quote.trim()}"\n\n${attribution}`),
    ])
  })

  // ── Slide 8: Closer ──────────────────────────────────────────────────────
  pres.addSlide('lib', SLIDES.closer, (_slide) => {
    // APAC closer slide — no modifications needed, template design preserved
  })

  // ── Remove sections ─────────────────────────────────────────────────────
  pres.modify((presentationXml: any) => {
    const sectionLists = presentationXml.getElementsByTagName('p14:sectionLst')
    if (sectionLists.length > 0) {
      for (let i = sectionLists.length - 1; i >= 0; i--) {
        sectionLists[i].parentNode?.removeChild(sectionLists[i])
      }
    }
  })

  // ── Write output ──────────────────────────────────────────────────────────
  console.log(`Writing ${OUTPUT_FILE}...`)
  const summary = await pres.write(OUTPUT_FILE)
  const outputPath = join(OUTPUT_DIR, OUTPUT_FILE)
  console.log(`Done! ${(readFileSync(outputPath).length / 1024 / 1024).toFixed(1)} MB`)
  console.log(`  ${summary.slides} slides, ${summary.duration}ms`)
}

// ─── Utility Functions ────────────────────────────────────────────────────────

function formatDateRange(start: string | null, end: string | null): string {
  if (!start || !end) return ''
  const s = new Date(start)
  const e = new Date(end)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${s.getDate()}-${e.getDate()} ${months[s.getMonth()]} ${s.getFullYear()}`
}

function chunkArray<T>(arr: T[], chunks: number): T[][] {
  const result: T[][] = Array.from({ length: chunks }, () => [])
  arr.forEach((item, i) => result[i % chunks].push(item))
  return result
}

function parseNarrative(narrative: string): string[] {
  if (!narrative) return ['', '', '', '']

  // AI narrative is stored as JSON: {headline, whatWorked, theSurprise, theRisk, quickWin}
  try {
    const parsed = typeof narrative === 'string' ? JSON.parse(narrative) : narrative
    return [
      parsed.headline || '',
      parsed.whatWorked || parsed.what_worked || '',
      parsed.theSurprise || parsed.the_surprise || '',
      parsed.theRisk || parsed.the_risk || parsed.quickWin || parsed.quick_win || '',
    ]
  } catch {
    // Fallback: split on double newlines
    const sections = narrative.split(/\n\n+/).filter(s => s.trim())
    return [
      sections[0]?.replace(/^#+\s+.*\n?/gm, '').replace(/^\*\*.*?\*\*:?\s*/gm, '').trim() || '',
      sections[1]?.replace(/^#+\s+.*\n?/gm, '').replace(/^\*\*.*?\*\*:?\s*/gm, '').trim() || '',
      sections[2]?.replace(/^#+\s+.*\n?/gm, '').replace(/^\*\*.*?\*\*:?\s*/gm, '').trim() || '',
      sections[3]?.replace(/^#+\s+.*\n?/gm, '').replace(/^\*\*.*?\*\*:?\s*/gm, '').trim() || '',
    ]
  }
}

function pickBestVerbatim(responses: ResponseData[]): ResponseData {
  // Pick the response with the longest "change_one_thing" or "session_reasons"
  return responses.reduce((best, r) => {
    const bestLen = (best.change_one_thing?.length || 0) + (best.session_reasons?.length || 0)
    const rLen = (r.change_one_thing?.length || 0) + (r.session_reasons?.length || 0)
    return rLen > bestLen ? r : best
  }, responses[0])
}

// ─── Main ─────────────────────────────────────────────────────────────────────

generate().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
