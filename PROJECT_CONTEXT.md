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
- **Automatic Token Refresh**: Scheduled refresh 5 minutes before expiry
- **Error Handling**: Comprehensive error types and recovery

### 2. HTTP Client (`src/lib/api/client.ts`)
- **Robust URL Handling**: Base path configuration for dev/prod environments
- **Authentication Integration**: Automatic Bearer token injection
- **Error Handling**: Structured HttpError class with status codes
- **Legacy Compatibility**: Backward-compatible exports for existing code

### 3. Query Builder (`src/lib/api/qs.ts`)
- **JSON:API Compliance**: Proper bracket notation for arrays and nested objects
- **Pagination Support**: `page[number]` and `page[size]` parameters
- **Filter Support**: Complex filter syntax with operators
- **Include Support**: Relationship inclusion handling

### 4. Spatial Data APIs

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
2. **Token Storage** → localStorage with expiry
3. **Automatic Injection** → All subsequent API requests
4. **Token Refresh** → Scheduled 5 minutes before expiry
5. **Logout** → Clear storage and cancel refresh

### Spatial Data Loading
1. **Layer Discovery** → GET `/spatial-feature` (small sample)
2. **Type Extraction** → Identify available feature types
3. **Filtered Loading** → GET `/spatial-feature` with type filters
4. **Data Transformation** → Convert to OpenLayers features
5. **Map Integration** → Add as vector layers

### Request/Response Pattern
```
Component → API Function → HTTP Client → Backend Response
    ↓              ↓              ↓              ↓
State Update ← Transformer ← JSON Parse ← Raw Response
```

## Key Components

### SmartGovLoader (`src/components/api/SmartGovLoader.tsx`)
- **Streamlined Interface**: Clean UI for API data loading
- **Authentication Management**: Built-in login/logout functionality
- **Layer Discovery**: Automatic detection of available layer types
- **Batch Loading**: Load multiple layer types simultaneously
- **Progress Tracking**: Real-time loading progress and statistics

### ApiLoadPanel (`src/components/ApiLoadPanel.tsx`)
- **Advanced Filtering**: Filter by type code and name patterns
- **Pagination Control**: Navigate through large datasets
- **Preview Table**: View results before loading as layers
- **Direct Integration**: Load filtered results as map layers

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
1. Use the built-in ApiDebugger component
2. Check authentication status in browser dev tools
3. Verify network requests in browser dev tools
4. Check API base URL configuration
5. Validate token storage and expiry

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

- Development-only components for API testing
- Mock data support for offline development
- Error boundary handling
- Performance monitoring capabilities
- Authentication flow testing

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