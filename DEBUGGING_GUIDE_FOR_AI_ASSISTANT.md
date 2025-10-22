# Debugging Guide: Intelligent Auto-Reload Mechanism for Tax Map Application

## Problem Statement
The tax map application's intelligent auto-reload mechanism is not working correctly. When users update metadata through the FocusCard and save changes, the UI shows blank data and doesn't reflect the updated values. Users have to manually close/reopen the FocusCard and manually reload the entire layer to see changes.

## Expected Behavior
1. User edits attribute value (e.g., "Nama wilayah") in FocusCard
2. User clicks save
3. API is updated successfully (this works)
4. FocusCard immediately shows the new value without blank screen
5. Map labels update to show new values
6. RightDock layer list updates if needed
7. No manual layer reload required

## Current Issues
1. FocusCard shows blank data after save
2. Old values persist in UI despite successful API update
3. Map labels don't update automatically    
4. Manual layer reload is required to see changes

## Key Files to Modify

### 1. src/hooks/useMetadataEditor.ts
- The save handler needs to properly trigger UI updates
- Current layer reload mechanism isn't updating the FocusCard data
- Need to ensure the focused feature gets fresh data after reload

### 2. src/components/FocusCard.tsx
- Needs to listen for layer reload events and update its display
- Current event listener for `layer-reloaded-for-focus-refresh` isn't working properly
- Need to properly extract and display updated attribute values from `_rawAttributes`

### 3. src/components/TaxMap.tsx
- Layer reload logic (lines 1714-1972) needs to emit proper events
- Focus restoration after reload needs to use fresh API data
- Current reload mechanism isn't properly updating the focus state

### 4. src/features/loadFromApi.ts
- Recently fixed `includeRawAttributes: true` - ensure this is working
- Both `loadApiLayer` and `addApiLayer` functions need to include `_rawAttributes`

## Critical Technical Details

### API Response Structure
```typescript
{
  total: number,
  pageNumber: number,
  pageSize: number,
  data: [{
    id: string,
    systemId: string,
    type: string,
    identifier: string,
    label: string,
    value: string,
    status: 1 | 2,
    attribute: [{
      id: string,
      attributeKey: string, // "spatialFeature.type", "spatialFeature.geometry", "spatialFeature.refWilayah"
      attributeLabel: string,
      attributeValue: string,
      attributeValueType: string
    }],
    // ... other fields
  }]
}
```

### Event Chain That Should Work
1. `useMetadataEditor` → save to API → trigger layer reload
2. `TaxMap` → handle `reload-api-layer` → reload layer data
3. `TaxMap` → emit `layer-reloaded-for-focus-refresh` with fresh data
4. `FocusCard` → listen for event → update display with fresh data

### Key Event Names
- `reload-api-layer` - Triggers layer reload in TaxMap
- `layer-reloaded-for-focus-refresh` - Updates FocusCard with fresh data
- `request-feature-props` - Requests feature data for FocusCard

## Specific Code Areas to Focus On

### In useMetadataEditor.ts (save handler)
```typescript
// After successful API save, need to:
// 1. Trigger layer reload for the specific layer
// 2. Ensure the focused feature gets updated data
// 3. Update FocusCard display without blank screen
```

### In FocusCard.tsx (event listener)
```typescript
// Listen for layer reload events and update display
// Extract name from _rawAttributes.spatialFeature.refWilayah
// Ensure no blank screen during transition
```

### In TaxMap.tsx (layer reload)
```typescript
// When reloading a layer, if there's a focused feature:
// 1. Get fresh data for that feature
// 2. Update focus state with new data
// 3. Emit event to update FocusCard
```

## Debugging Steps
1. Add comprehensive logging to track the event chain
2. Verify API responses contain updated data
3. Check event payloads contain correct feature data
4. Ensure FocusCard receives and processes events correctly
5. Test with specific attribute changes (e.g., "Nama wilayah")

## Testing Scenario
1. Load API layer (e.g., type 20000001)
2. Click on a feature to open FocusCard
3. Edit "Nama wilayah" value
4. Click save
5. Verify: FocusCard shows new value immediately, no blank screen
6. Verify: Map label updates automatically
7. Verify: No manual reload needed

## Current State
- API updates work correctly (confirmed via Postman)
- Layer reload mechanism exists but isn't updating FocusCard properly
- Event system is partially implemented but has timing/data issues
- `includeRawAttributes: true` was recently fixed

## Expected Solution
Fix the event-driven data flow so that when metadata is saved:
1. The layer reloads with fresh data
2. The FocusCard updates immediately with the new values
3. No blank screens or manual reloads are required
4. All UI components stay synchronized

## Root Cause Analysis
The issue appears to be in the event timing and data flow:
1. When the layer is reloaded, the FocusCard doesn't get the updated data
2. The focus state in useMapStore may be holding stale data
3. The event listener in FocusCard may not be properly handling the reload event
4. The layer reload may be completing but not updating the specific feature that's focused

## Critical Code Sections to Review

### TaxMap.tsx - Layer Reload Logic (lines 1714-1972)
```typescript
// Check if this section properly:
// 1. Reloads the layer with fresh data
// 2. Finds the focused feature in the new data
// 3. Updates the focus state with fresh data
// 4. Emits the proper event to update FocusCard
```

### FocusCard.tsx - Event Listener
```typescript
// Check if the event listener for 'layer-reloaded-for-focus-refresh'
// properly updates the display with fresh data from _rawAttributes
```

### useMetadataEditor.ts - Save Handler
```typescript
// Check if the save handler properly triggers layer reload
// and ensures the FocusCard gets updated with fresh data
```

## Additional Notes
- The user is frustrated with the current implementation
- Multiple attempts have been made to fix this issue
- The problem is specifically in the UI update chain, not the API updates
- The solution needs to be comprehensive and handle all edge cases
- Proper error handling and logging should be included for debugging