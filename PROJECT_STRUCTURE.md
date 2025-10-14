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
│
├── src/
│   ├── components/              # React components
│   │   ├── ExportModal.tsx
│   │   ├── FocusCard.tsx
│   │   ├── FooterBars.tsx
│   │   ├── LayerLoadModal.tsx
│   │   ├── LeftDock.tsx
│   │   ├── RightDock.tsx
│   │   ├── TaxMap.tsx           # Main map component
│   │   └── Topbar.tsx
│   │
│   ├── dev/                     # Development-only components
│   │   ├── ApiDeepCheck.tsx     # API testing tool
│   │  
│   │
│   ├── hooks/                   # Custom React hooks
│   │   ├── useLayersStore.ts    # Layer management state
│   │   └── useMapStore.ts       # Map state management
│   │
│   ├── lib/                     # Core utilities and API
│   │   ├── api/                 # API layer
│   │   │   ├── auth.ts          # Authentication functions
│   │   │   ├── client.ts        # NEW: HTTP client with robust URL handling
│   │   │   ├── qs.ts            # NEW: JSON:API query builder
│   │   │   └── spatialFeature.ts # Spatial Feature API with pagination
│   │   └── config.ts            # Configuration constants
│   │
│   ├── styles/                  # CSS styles
│   │   └── ui.css
│   │
│   ├── types/                   # TypeScript type definitions
│   │   └── shp-write.d.ts
│   │
│   ├── assets/                  # Static assets
│   │   └── react.svg
│   │
│   ├── App.tsx                  # Root application component
│   ├── main.tsx                 # Application entry point
│   └── vite-env.d.ts            # Vite environment types
│
├── tmp_zip/                     # Temporary zip extraction folder
│   └── layers/
│
├── index.html                   # HTML template
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── tsconfig.app.json            # App-specific TypeScript config
├── tsconfig.node.json           # Node-specific TypeScript config
├── vite.config.ts               # Vite build configuration
├── eslint.config.js             # ESLint configuration
├── .gitignore                   # Git ignore rules
├── structure.txt                # Project structure notes
└── PROJECT_STRUCTURE.md         # This documentation file
```

## API Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        API Layer                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   client.ts │    │     qs.ts   │    │spatialFeature│     │
│  │             │    │             │    │     .ts      │     │
│  │ • HTTP      │    │ • JSON:API  │    │             │     │
│  │   requests  │    │   query     │    │ • list*()    │     │
│  │ • Auth      │    │   builder   │    │ • listAll()  │     │
│  │   headers   │    │ • page[]    │    │ • count()    │     │
│  │ • URL       │    │ • include[] │    │ • get()      │     │
│  │   joining   │    │ • filter[]  │    │             │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                             │
│  ┌─────────────┐                                           │
│  │   auth.ts   │                                           │
│  │             │                                           │
│  │ • login()   │                                           │
│  │ • logout()  │                                           │
│  │ • token     │                                           │
│  │   management│                                           │
│  └─────────────┘                                           │
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
    └── Dev Components (DEV only)
        ├── ApiDeepCheck.tsx
        └── LoadAllCheck.tsx (NEW)
```

## Data Flow

```
User Interaction
       │
       ▼
Component Event (TaxMap.tsx)
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
Response Processing
       │
       ▼
State Update (useMapStore/useLayersStore)
       │
       ▼
UI Re-render (OpenLayers)
```

## JSON:API Implementation Details

### Query Parameters
The new implementation supports standardized JSON:API parameters:

- `page[number]`: Page number for pagination
- `page[size]`: Number of items per page (default: 50)
- `include[]`: Related resources to include (default: ['attribute'])
- `filter[]`: Filtering conditions (e.g., ['status|eq|1'])

### Pagination Flow
```
listAllSpatialFeaturesJsonApi()
    │
    ├── Fetch page 1 with pageSize
    │
    ├── Extract total count from response
    │
    ├── Calculate total pages needed
    │
    ├── Loop through remaining pages
    │
    └── Aggregate all results
```

### Type Safety
- `SpatialAttr`: Attribute type definition
- `SpatialFeatureRow`: Feature type definition
- `Paged<T>`: Generic paginated response type
- `PageInput`: Pagination parameters type

## Development Tools

The project includes development-only components:

1. **ApiDeepCheck.tsx**: Existing API testing tool
   - Tests basic API connectivity
   - Located at top-right corner in dev mode

2. **LoadAllCheck.tsx**: NEW pagination testing tool
   - Tests the complete pagination flow
   - Shows real-time status updates
   - Displays total feature count
   - Located below ApiDeepCheck in dev mode
   - Only visible when `import.meta.env.DEV` is true

## Key Features

### JSON:API Integration
- Standardized query parameter handling
- Efficient pagination with automatic page iteration
- Safety limits (maxPages: 500) to prevent infinite loops
- Backward compatibility with existing API functions

### HTTP Client Features
- Robust URL joining with base path handling
- Automatic authentication token management
- Proper error handling with status codes
- Support for both JSON and text responses

### Development Experience
- Hot module replacement with Vite
- TypeScript for type safety
- ESLint for code quality
- Dev-only testing components
- Environment-specific configuration