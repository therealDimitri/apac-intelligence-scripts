#!/usr/bin/env node
/**
 * Test script for deep link handlers
 * Verifies that the code correctly handles ?action=create and ?action=schedule URLs
 */

import fs from 'fs'
import path from 'path'

const projectRoot = process.cwd()

console.log('🧪 Testing Deep Link Implementation\n')

let passed = 0
let failed = 0

function test(name, condition, details = '') {
  if (condition) {
    console.log(`✅ ${name}`)
    passed++
  } else {
    console.log(`❌ ${name}`)
    if (details) console.log(`   ${details}`)
    failed++
  }
}

// Test 1: CreateActionModal has defaultClient prop
const createActionModalPath = path.join(projectRoot, 'src/components/CreateActionModal.tsx')
const createActionModalContent = fs.readFileSync(createActionModalPath, 'utf-8')

test(
  'CreateActionModal has defaultClient prop in interface',
  createActionModalContent.includes('defaultClient?: string'),
  'Missing: defaultClient?: string in interface'
)

test(
  'CreateActionModal destructures defaultClient',
  createActionModalContent.includes('defaultClient,') || createActionModalContent.includes('defaultClient }'),
  'Missing: defaultClient in component props destructuring'
)

test(
  'CreateActionModal uses defaultClient in useEffect',
  createActionModalContent.includes('isOpen && defaultClient'),
  'Missing: useEffect that sets client when modal opens with defaultClient'
)

// Test 2: Actions page handles ?action=create
const actionsPagePath = path.join(projectRoot, 'src/app/(dashboard)/actions/page.tsx')
const actionsPageContent = fs.readFileSync(actionsPagePath, 'utf-8')

test(
  'Actions page has createActionClient state',
  actionsPageContent.includes('createActionClient') && actionsPageContent.includes('setCreateActionClient'),
  'Missing: createActionClient state variable'
)

test(
  'Actions page checks for action=create',
  actionsPageContent.includes("actionParam === 'create'") || actionsPageContent.includes('actionParam === "create"'),
  'Missing: check for action=create in deep link handler'
)

test(
  'Actions page passes defaultClient to CreateActionModal',
  actionsPageContent.includes('defaultClient={createActionClient}'),
  'Missing: defaultClient prop passed to CreateActionModal'
)

// Test 3: Meetings page handles ?action=schedule
const meetingsPagePath = path.join(projectRoot, 'src/app/(dashboard)/meetings/page.tsx')
const meetingsPageContent = fs.readFileSync(meetingsPagePath, 'utf-8')

test(
  'Meetings page has scheduleClient state',
  meetingsPageContent.includes('scheduleClient') && meetingsPageContent.includes('setScheduleClient'),
  'Missing: scheduleClient state variable'
)

test(
  'Meetings page checks for action=schedule',
  meetingsPageContent.includes("actionParam === 'schedule'") || meetingsPageContent.includes('actionParam === "schedule"'),
  'Missing: check for action=schedule in deep link handler'
)

test(
  'Meetings page passes contextClientName to AIFirstMeetingModal',
  meetingsPageContent.includes('contextClientName={scheduleClient}'),
  'Missing: contextClientName prop passed to AIFirstMeetingModal'
)

// Test 4: AIFirstMeetingModal accepts contextClientName
const aiMeetingModalPath = path.join(projectRoot, 'src/components/AIFirstMeetingModal.tsx')
const aiMeetingModalContent = fs.readFileSync(aiMeetingModalPath, 'utf-8')

test(
  'AIFirstMeetingModal has contextClientName prop',
  aiMeetingModalContent.includes('contextClientName'),
  'Missing: contextClientName in AIFirstMeetingModal props'
)

// Test 5: Crew route generates correct URLs
const crewRoutePath = path.join(projectRoot, 'src/app/api/chasen/crew/route.ts')
const crewRouteContent = fs.readFileSync(crewRoutePath, 'utf-8')

test(
  'Crew route generates Create Action URL with action=create',
  crewRouteContent.includes('action=create') || crewRouteContent.includes("type: 'create-action'"),
  'Missing: Create Action quick action in crew route'
)

test(
  'Crew route generates Schedule Meeting URL with action=schedule',
  crewRouteContent.includes('action=schedule') || crewRouteContent.includes("type: 'schedule-meeting'"),
  'Missing: Schedule Meeting quick action in crew route'
)

// Summary
console.log('\n' + '─'.repeat(50))
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)

if (failed === 0) {
  console.log('\n🎉 All deep link tests passed!')
  process.exit(0)
} else {
  console.log('\n⚠️  Some tests failed. Please review the implementation.')
  process.exit(1)
}
