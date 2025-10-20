# Tax Map React - Project Context

## Project Overview

This is a **Tax Map React Application** built with TypeScript, Vite, and OpenLayers for displaying and managing spatial tax data. The application provides an interactive map interface for visualizing tax-related geographic features with capabilities for layer management, data export, and comprehensive API integration with the SmartGov backend system.

## Technology Stack

- **Frontend Framework**: React 19.1.1 with TypeScript
- **Build Tool**: Vite 7.1.2
- **Mapping Library**: OpenLayers 10.6.1
- **State Management**: Zustand 5.0.8
- **Geospatial Libraries**: 
  - shp-write, @crmackey/shp-write (for shapefile export)
  - shpjs (for shapefile parsing)
  - jszip (for zip file handling)
- **Development Tools**: ESLint, TypeScript

## Key Features

1. **Interactive Map Display**: Using OpenLayers for rendering geographic data
2. **Layer Management**: Add, remove, and toggle different data layers
3. **Data Export**: Export map data as shapefiles
4. **SmartGov API Integration**: Full JSON:API compliant backend communication with authentication
5. **Advanced Data Loading**: Streamlined interface for loading spatial data from API
6. **Development Tools**: Built-in API debugging and testing components

## Project Structure

```
tax-map-react/
├── public/
│   ├── data/                    # Static data files (zip archives)
│   │   ├── 51.zip
│   │   └── 5103.zip
│   └── images/                  # Static assets
│       ├── login-logo.png
│       ├── smart-gov-revenue-small.png
│       └── vite.svg

├── src/
│   ├── components/              # React components
│   │   ├── ExportModal.tsx      # Data export interface
│   │   ├── FocusCard.tsx        # Feature focus display
│   │   ├── FooterBars.tsx       # Bottom UI bar
│   │   ├── LayerLoadModal.tsx   # Layer loading interface
│   │   ├── LeftDock.tsx         # Left side panel
│   │   ├── RightDock.tsx        # Right side panel
│   │   ├── TaxMap.tsx           # Main map component
│   │   ├── Topbar.tsx           # Top navigation bar
│   │   ├── ApiLoadPanel.tsx     # API data loading panel
│   │   └── api/                 # API-specific components
│   │       └── SmartGovLoader.tsx # Streamlined API loader
│   │
│   ├── dev/                     # Development-only components
│   │   └── ApiDebugger.tsx      # API testing tool
│   │  
│   ├── features/                # Feature modules
│   │   └── loadFromApi.ts       # API layer loading logic
│   │
│   ├── hooks/                   # Custom React hooks
│   │   ├── useLayersStore.ts    # Layer management state
│   │   └── useMapStore.ts       # Map state management
│   │
│   ├── lib/                     # Core utilities and API
│   │   ├── api/                 # API layer
│   │   │   ├── auth.ts          # Authentication management
│   │   │   ├── client.ts        # HTTP client with robust URL handling
│   │   │   ├── qs.ts            # JSON:API query builder
│   │   │   ├── spatialFeature.ts # Spatial Feature API with pagination
│   │   │   ├── spatialGeneric.ts # Generic spatial data API
│   │   │   └── transformers.ts  # Data transformation utilities
│   │   ├── geo/                 # Geospatial utilities
│   │   │   └── wktConverter.ts  # WKT to OpenLayers feature conversion
│   │   └── config.ts            # Configuration constants
│   │
│   ├── styles/                  # CSS styles
│   │   └── ui.css
│   │
│   ├── types/                   # TypeScript type definitions
│   │   └── shp-write.d.ts       # Shapefile writing types
│   │
│   ├── assets/                  # Static assets
│   │   └── react.svg
│   │
│   ├── App.tsx                  # Root application component
│   ├── main.tsx                 # Application entry point
│   └── vite-env.d.ts            # Vite environment types

├── tmp_zip/                     # Temporary zip extraction folder
│   └── layers/
```

## API Architecture

The application uses a comprehensive JSON:API compliant backend with the following structure:

### 1. Authentication System (`src/lib/api/auth.ts`)
- **AuthenticationManager**: Singleton class managing authentication state
- **Token Management**: Automatic storage, refresh, and expiry handling
- **Login/Logout**: Complete authentication flow with SmartGov backend
- **WIB Timezone Support**: Indonesia Western Indonesia Time (UTC+7) timestamp handling
- **Token Expiration Logic**: Separated actual expiration from "expiring soon" checks
- **Auto-Login Functionality**: Seamless authentication on app restart and API access
- **State Synchronization**: Real-time authentication state updates across components
- **Error Handling**: Comprehensive error types and recovery with detailed logging

### 2. HTTP Client (`src/lib/api/client.ts`)
- **Robust URL Handling**: Base path configuration for dev/prod environments
- **Authentication Integration**: Consistent Bearer token injection using auth manager
- **401 Error Handling**: Automatic authentication state updates on token expiry
- **Debugging Support**: Comprehensive request/response logging for troubleshooting
- **Error Handling**: Structured HttpError class with status codes
- **Legacy Compatibility**: Backward-compatible exports for existing code

### 3. Query Builder (`src/lib/api/qs.ts`)
- **JSON:API Compliance**: Proper bracket notation for arrays and nested objects
- **Pagination Support**: `page[number]` and `page[size]` parameters
- **Filter Support**: Complex filter syntax with operators
- **Include Support**: Relationship inclusion handling

### 4. Spatial Data APIs

#### Spatial Feature API (`src/lib/api/spatialFeature.ts`)
- **Pagination Support**: Complete pagination with total, pageNumber, pageSize
- **Attribute Structure**: Key-value attribute system with proper typing
- **Layer Grouping**: Group features by spatialFeature.type attribute
- **Status Filtering**: Only return active features (status = 1)
- **Type Safety**: Full TypeScript definitions for response structure

#### Generic Spatial API (`src/lib/api/spatialGeneric.ts`)
- **SpatialRow**: Core data structure with attributes
- **SpatialAttribute**: Key-value attribute system
- **List Operations**: Paginated retrieval with filtering
- **Type Safety**: Full TypeScript definitions

#### Data Transformers (`src/lib/api/transformers.ts`)
- **Feature Normalization**: Convert API responses to standardized format
- **Attribute Extraction**: Extract specific attributes from spatial features
- **Data Validation**: Validate transformed features
- **Utility Functions**: Grouping, filtering, and statistics

### 5. Geospatial Conversion (`src/lib/geo/wktConverter.ts`)
- **WKT Parsing**: Convert Well-Known Text to OpenLayers features
- **Geometry Handling**: Support for various geometry types
- **Property Mapping**: Preserve feature properties during conversion

## Configuration

### API Configuration
- **Development**: Uses `/api` as base URL (proxy via Vite)
- **Production**: Uses `https://retfw.smartgov.id/framework`
- **Authentication Endpoints**:
  - Login: `/api/auth/login`
  - Logout: `/api/auth/logout`
  - Refresh: `/api/auth/refresh`
  - Validate: `/api/auth/validate`

### Default Credentials (Development)
- Username: `sa`
- Password: `pass@word1`

### Environment Variables
- `VITE_API_BASE_URL`: Production API base URL

## API Data Flow

### Authentication Flow
1. **Login Request** → POST `/api/auth/login`
2. **Token Storage** → localStorage with WIB timezone expiry
3. **Auto-Login** → Automatic authentication on app restart
4. **State Synchronization** → Real-time updates across all components
5. **Token Validation** → Separate actual expiration from "expiring soon"
6. **Automatic Injection** → All subsequent API requests
7. **401 Error Recovery** → Automatic state updates on token expiry
8. **Logout** → Clear storage and cancel refresh

### Spatial Data Loading
1. **Authentication Check** → Verify user is authenticated
2. **Layer Discovery** → GET `/spatial-feature` with proper filters
3. **Type Extraction** → Identify available feature types from attributes
4. **Layer Grouping** → Group by spatialFeature.type attribute values
5. **Filtered Loading** → GET `/spatial-feature` with type and status filters
6. **Data Transformation** → Convert to OpenLayers features
7. **Map Integration** → Add as vector layers with proper naming

### Request/Response Pattern
```
Component → API Function → HTTP Client → Backend Response
    ↓              ↓              ↓              ↓
State Update ← Transformer ← JSON Parse ← Raw Response
```

## Key Components

### LayerLoadModal (`src/components/LayerLoadModal.tsx`)
- **Dual Interface**: Local file loading and API-based layer loading
- **Authentication State Management**: Real-time authentication status display
- **Hierarchical Feature Grouping**: Organize features by type and refWilayah
- **Auto-Login Integration**: Seamless authentication when accessing API tab
- **State Synchronization**: Immediate UI updates after authentication
- **Progress Tracking**: Real-time loading progress and error handling
- **Responsive Design**: Scrollable interfaces with proper overflow handling

### SmartGovLoader (`src/components/api/SmartGovLoader.tsx`)
- **Streamlined Interface**: Clean UI for API data loading
- **Authentication Management**: Built-in login/logout functionality
- **WIB Timezone Display**: Token expiration in Indonesia Western Time
- **Auto-Login Behavior**: Automatic authentication on component mount
- **Layer Discovery**: Automatic detection of available layer types
- **Batch Loading**: Load multiple layer types simultaneously
- **Progress Tracking**: Real-time loading progress and statistics

### ApiLoadPanel (`src/components/ApiLoadPanel.tsx`)
- **Advanced Filtering**: Filter by type code and name patterns
- **Pagination Control**: Navigate through large datasets
- **Preview Table**: View results before loading as layers
- **Direct Integration**: Load filtered results as map layers
- **WIB Timezone Support**: Display timestamps in local timezone

### Data Loading Feature (`src/features/loadFromApi.ts`)
- **WKT Conversion**: Convert API geometry to OpenLayers features
- **Property Mapping**: Preserve all feature attributes
- **Layer Creation**: Create styled vector layers
- **Store Integration**: Add layers to Zustand state management

## Spatial Feature Types

The application supports various spatial feature types identified by type codes:
- **20000001**: Administrative Boundaries
- **20000002**: Land Use
- **20000003**: Buildings
- **20000004**: Roads
- **20000005**: Water Bodies
- **20000006**: Vegetation
- **20000007**: Points of Interest

## Spatial Feature API Response Structure

### JSON Response Format
The spatial feature API returns a paginated response with the following structure:
```json
{
  "total": 1500,
  "pageNumber": 1,
  "pageSize": 100,
  "data": [
    {
      "id": "unique-region-code",
      "systemId": "system-identifier",
      "type": "feature-type",
      "identifier": "feature-identifier",
      "label": "feature-label",
      "value": "feature-value",
      "status": 1,
      "attribute": [
        {
          "id": "attr-id",
          "attributeKey": "spatialFeature.type",
          "attributeLabel": "Type",
          "attributeValue": "20000001",
          "attributeValueType": "string"
        },
        {
          "id": "attr-id-2",
          "attributeKey": "spatialFeature.refWilayah",
          "attributeLabel": "Region Reference",
          "attributeValue": "Region Name",
          "attributeValueType": "string"
        }
      ],
      "description": "Feature description",
      "createdBy": "creator",
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedBy": "updater",
      "updatedAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### Layer Grouping Logic
- **Primary Grouping**: Features with same `spatialFeature.type` attribute value belong to same layer
- **Layer Naming**: Use `attributeValue` from `spatialFeature.refWilayah` as layer name
- **Status Filtering**: Only load features with `status = 1` (active)
- **Dynamic Attributes**: New metadata added through FocusCard appears in attribute array

## Development Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Development Server**:
   ```bash
   npm run dev
   ```

3. **Build for Production**:
   ```bash
   npm run build
   ```

4. **Lint Code**:
   ```bash
   npm run lint
   ```

## Common Development Tasks

### Adding New API Endpoints
1. Update `src/lib/api/client.ts` if new HTTP methods needed
2. Add query parameters to `src/lib/api/qs.ts`
3. Implement API functions in appropriate files
4. Update TypeScript types
5. Add transformers if needed

### Debugging API Issues
1. Use the built-in ApiDebugger component for comprehensive API testing
2. Check authentication status in browser dev tools (localStorage and console)
3. Verify network requests in browser dev tools for proper token attachment
4. Check API base URL configuration for dev/prod environments
5. Validate token storage and expiry with WIB timezone considerations
6. Monitor authentication state synchronization between components
7. Check browser console for detailed authentication debugging logs

### Adding New Map Layers from API
1. Identify feature type code for new data
2. Update SmartGovLoader with type name/description
3. Add any required attribute transformations
4. Test with ApiLoadPanel first
5. Integrate with main loading flow

## Data Transformations

### Attribute Extraction
The API uses a key-value attribute system where spatial features contain:
- **Core Attributes**: `spatialFeature.geometry`, `spatialFeature.type`, `spatialFeature.refWilayah`
- **Custom Attributes**: Domain-specific data with arbitrary keys
- **Metadata**: Creation/update timestamps, status information
- **Dynamic Attributes**: User-added metadata through FocusCard interface

### Feature Normalization
Transformers convert API responses to standardized format:
```typescript
{
  id: string,
  uuid: string,
  name: string,
  typeCode: string,
  geometry: string,
  properties: Record<string, any>,
  original: SpatialRow
}
```

### Authentication State Management
The authentication system provides comprehensive state management:
- **Real-time Updates**: Components immediately reflect authentication changes
- **Auto-Login**: Seamless authentication on app restart and API access
- **WIB Timezone**: All timestamps displayed in Indonesia Western Time
- **Error Recovery**: Automatic handling of token expiry and 401 errors
- **Debugging Support**: Comprehensive logging for troubleshooting

## File Naming Conventions

- Components: PascalCase (e.g., `ExportModal.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useLayersStore.ts`)
- Utilities: camelCase (e.g., `client.ts`)
- Types: camelCase with descriptive names (e.g., `shp-write.d.ts`)
- Features: camelCase (e.g., `loadFromApi.ts`)

## Code Style

- TypeScript strict mode enabled
- ESLint configuration for code quality
- Functional components with hooks
- Zustand for state management
- CSS modules or styled components for styling
- Comprehensive error handling

## Testing

- Development-only components for API testing (ApiDebugger)
- Mock data support for offline development
- Error boundary handling with detailed error reporting
- Performance monitoring capabilities
- Authentication flow testing with state synchronization
- Real-time authentication state debugging in browser console
- WIB timezone testing for timestamp functionality

## Deployment

- Built with Vite for optimal performance
- Production builds optimized with TypeScript compilation
- Static assets served from public directory
- Environment-specific API configuration
- Authentication token management in production

---

**Last Updated**: October 2025
**Project Version**: 0.0.0
**Framework**: React 19.1.1 with TypeScript
**Authentication System**: Enhanced with WIB timezone and state synchronization
**Spatial Feature API**: Complete implementation with pagination and attribute handling