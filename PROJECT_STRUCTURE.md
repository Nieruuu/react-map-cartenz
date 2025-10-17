# Tax Map React Project Structure

```
tax-map-react/
├── public/
│   ├── data/                    # Static data files
│   │   ├── 51.zip
│   │   └── 5103.zip
│   └── images/                  # Static assets
│       ├── login-logo.png
│       ├── smart-gov-revenue-small.png
│       └── vite.svg

├── src/
│   ├── components/              # React components
│   │   ├── ApiLoadPanel.tsx     # API data loading panel with filtering
│   │   ├── ExportModal.tsx      # Data export interface
│   │   ├── FocusCard.tsx        # Feature focus display
│   │   ├── FooterBars.tsx       # Bottom UI bar
│   │   ├── LayerLoadModal.tsx   # Layer loading interface
│   │   ├── LeftDock.tsx         # Left side panel
│   │   ├── RightDock.tsx        # Right side panel
│   │   ├── TaxMap.tsx           # Main map component
│   │   ├── Topbar.tsx           # Top navigation bar
│   │   └── api/                 # API-specific components
│   │       └── SmartGovLoader.tsx # Streamlined API loader UI
│   
│   ├── dev/                     # Development-only components
│   │   └── ApiDebugger.tsx      # Comprehensive API debugging tool
│   
│   ├── features/                # Feature modules
│   │   └── loadFromApi.ts       # API layer loading logic
│   
│   ├── hooks/                   # Custom React hooks
│   │   ├── useLayersStore.ts    # Layer management state
│   │   └── useMapStore.ts       # Map state management
│   
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
│   
│   ├── styles/                  # CSS styles
│   │   └── ui.css
│   
│   ├── types/                   # TypeScript type definitions
│   │   └── shp-write.d.ts       # Shapefile writing types
│   
│   ├── assets/                  # Static assets
│   │   └── react.svg
│   
│   ├── App.tsx                  # Root application component
│   ├── main.tsx                 # Application entry point
│   └── vite-env.d.ts            # Vite environment types

├── tmp_zip/                     # Temporary zip extraction folder
│   └── layers/

├── index.html                   # HTML template
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── tsconfig.app.json            # App-specific TypeScript config
├── tsconfig.node.json           # Node-specific TypeScript config
├── vite.config.ts               # Vite build configuration
├── eslint.config.js             # ESLint configuration
├── .gitignore                   # Git ignore rules
├── structure.txt                # Project structure notes
├── PROJECT_CONTEXT.md           # Project context documentation
├── PROJECT_STRUCTURE.md         # This documentation file
├── API_DEBUGGING_GUIDE.md       # API debugging guide
└── API_IMPLEMENTATION_GUIDE.md  # API implementation guide
```

## API Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        API Layer                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   client.ts │    │     qs.ts   │    │spatialGeneric│     │
│  │             │    │             │    │     .ts      │     │
│  │ • HTTP      │    │ • JSON:API  │    │             │     │
│  │   requests  │    │   query     │    │ • list*()    │     │
│  │ • Auth      │    │   builder   │    │ • pagination│     │
│  │   headers   │    │ • page[]    │    │ • filters[]  │     │
│  │ • URL       │    │ • include[] │    │ • type defs │     │
│  │   joining   │    │ • filter[]  │    │             │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   auth.ts   │    │transformers │    │wktConverter │     │
│  │             │    │    .ts      │    │    .ts      │     │
│  │ • login()   │    │ • feature   │    │ • WKT parse │     │
│  │ • logout()  │    │   transform │    │ • geometry  │     │
│  │ • token     │    │ • attribute │    │   handling  │     │
│  │   management│    │   extraction│    │ • feature   │     │
│  │ • refresh   │    │ • validation│    │   creation  │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
App.tsx
│
└── TaxMap.tsx (Main Map Component)
    │
    ├── OpenLayers Map Instance
    │   ├── Base Tile Layer (OSM/ESRI/etc.)
    │   └── Vector Layers (Spatial Features)
    │
    ├── UI Components
    │   ├── Topbar.tsx
    │   ├── LeftDock.tsx
    │   ├── RightDock.tsx
    │   └── FooterBars.tsx
    │
    ├── Modal Components
    │   ├── ExportModal.tsx
    │   ├── LayerLoadModal.tsx
    │   └── FocusCard.tsx
    │
    ├── API Components
    │   ├── ApiLoadPanel.tsx
    │   └── api/SmartGovLoader.tsx
    │
    └── Dev Components (DEV only)
        └── ApiDebugger.tsx
```

## Data Flow

```
User Interaction
       │
       ▼
Component Event (TaxMap.tsx/SmartGovLoader.tsx)
       │
       ▼
API Call (client.ts)
       │
       ▼
Query Builder (qs.ts)
       │
       ▼
HTTP Request with JSON:API params
       │
       ▼
Backend Response
       │
       ▼
Data Transformation (transformers.ts)
       │
       ▼
WKT Conversion (wktConverter.ts)
       │
       ▼
State Update (useMapStore/useLayersStore)
       │
       ▼
UI Re-render (OpenLayers)
```

## JSON:API Implementation Details

### Query Parameters
The implementation supports standardized JSON:API parameters:

- `page[number]`: Page number for pagination
- `page[size]`: Number of items per page (default: 50)
- `include[]`: Related resources to include (default: ['attribute'])
- `filter[]`: Filtering conditions (e.g., ['status|eq|1', 'spatialFeature.type|eq|20000001'])

### Spatial Data Types
The application supports various spatial feature types identified by type codes:
- **20000001**: Administrative Boundaries
- **20000002**: Land Use
- **20000003**: Buildings
- **20000004**: Roads
- **20000005**: Water Bodies
- **20000006**: Vegetation
- **20000007**: Points of Interest

### Data Transformation Flow
```typescript
SpatialRow (API Response)
    │
    ▼
transformSpatialRows() → TransformedFeature[]
    │
    ▼
extractAttribute() → Extract geometry, name, type
    │
    ▼
wktToFeature() → OpenLayers Feature
    │
    ▼
addApiLayer() → Vector Layer on Map
```

### Type Safety
- `SpatialAttribute`: Attribute type definition
- `SpatialRow`: Feature type definition
- `SpatialListResponse`: Paginated response type
- `ListGenericParams`: Query parameters type
- `TransformedFeature`: Normalized feature type

## Development Tools

The project includes comprehensive development tools:

### 1. ApiDebugger.tsx
- **Authentication Testing**: Login/logout functionality
- **API Connectivity Tests**: Comprehensive endpoint testing
- **Data Transformation Testing**: Validate transformer functions
- **WKT Conversion Testing**: Test geometry conversion
- **Real-time Logging**: Debug logs with different levels
- **Network Inspection**: Request/response analysis

### 2. SmartGovLoader.tsx
- **Streamlined Interface**: Clean UI for API data loading
- **Layer Discovery**: Automatic detection of available layer types
- **Batch Loading**: Load multiple layer types simultaneously
- **Progress Tracking**: Real-time loading progress and statistics
- **Authentication Management**: Built-in login/logout functionality

### 3. ApiLoadPanel.tsx
- **Advanced Filtering**: Filter by type code and name patterns
- **Pagination Control**: Navigate through large datasets
- **Preview Table**: View results before loading as layers
- **Direct Integration**: Load filtered results as map layers

## Key Features

### JSON:API Integration
- Standardized query parameter handling
- Efficient pagination with automatic page iteration
- Complex filtering with operator support
- Relationship inclusion handling
- Full TypeScript support

### HTTP Client Features
- Robust URL joining with base path handling
- Automatic authentication token management
- Proper error handling with status codes
- Support for both JSON and text responses
- Development/production environment configuration

### Geospatial Processing
- WKT to OpenLayers feature conversion
- Geometry validation and sanitization
- Coordinate system transformations
- Property preservation during conversion
- Batch processing capabilities

### Data Transformation
- Attribute extraction from complex API responses
- Feature normalization and validation
- Type-based grouping and filtering
- Statistics and summary generation
- Error handling and recovery

### Development Experience
- Hot module replacement with Vite
- TypeScript for type safety
- ESLint for code quality
- Comprehensive debugging tools
- Environment-specific configuration
- API testing framework

## API Configuration

### Development Environment
- **Base URL**: `/api` (proxied via Vite)
- **Authentication**: `/api/auth/login`
- **Spatial Features**: `/api/spatial-feature`

### Production Environment
- **Base URL**: `https://retfw.smartgov.id/framework`
- **Authentication**: `/framework/auth/login`
- **Spatial Features**: `/framework/spatial-feature`

### Default Credentials
- **Username**: `sa`
- **Password**: `pass@word1`

## Documentation Guides

### API_DEBUGGING_GUIDE.md
- Troubleshooting authentication issues
- Network request inspection
- Common error solutions
- Postman comparison guide
- Implementation details

### API_IMPLEMENTATION_GUIDE.md
- Step-by-step implementation
- Error troubleshooting by ID
- Integration with components
- Best practices
- Performance monitoring

### PROJECT_CONTEXT.md
- Complete project overview
- Technology stack details
- API architecture explanation
- Development setup instructions
- Common development tasks

## File Naming Conventions

- **Components**: PascalCase (e.g., `ExportModal.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useLayersStore.ts`)
- **Utilities**: camelCase (e.g., `client.ts`)
- **Types**: camelCase with descriptive names (e.g., `shp-write.d.ts`)
- **Features**: camelCase (e.g., `loadFromApi.ts`)
- **Documentation**: UPPERCASE_SNAKE_CASE (e.g., `API_DEBUGGING_GUIDE.md`)