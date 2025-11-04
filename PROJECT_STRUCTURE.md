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
│   │   ├── DrawingFormModal.tsx # Form for entering drawing metadata
│   │   ├── DrawingToolbar.tsx   # Toolbar for drawing operations
│   │   ├── ExportModal.tsx      # Data export interface
│   │   ├── FocusCard.tsx        # Feature focus display with metadata editing
│   │   ├── FooterBars.tsx       # Bottom UI bar
│   │   ├── LayerLoadModal.tsx   # Enhanced layer loading interface
│   │   ├── LeftDock.tsx         # Left side panel
│   │   ├── LoadingScreen.tsx    # Global loading screen with progress
│   │   ├── RightDock.tsx        # Right side panel
│   │   ├── TaxMap.tsx           # Main map component
│   │   ├── Topbar.tsx           # Top navigation bar
│   │   ├── TranslateFeatureModal.tsx # Feature translation interface
│   │   ├── TranslateLayerModal.tsx   # Layer translation interface
│   │   ├── VertexEditingModal.tsx    # Vertex editing interface
│   │   ├── VertexEditingToolbar.tsx  # Toolbar for vertex editing operations
│   │   └── api/                 # API-specific components
│   │       └── SmartGovLoader.tsx # Streamlined API loader UI
  
│   ├── dev/                     # Development-only components
│   │   └── ApiDebugger.tsx      # Comprehensive API debugging tool
  
│   ├── features/                # Feature modules
│   │   └── loadFromApi.ts       # API layer loading logic
  
│   ├── hooks/                   # Custom React hooks
│   │   ├── useLayersStore.ts    # Layer management state
│   │   ├── useLoadingState.ts   # Global loading state management
│   │   ├── useMapStore.ts       # Map state management
│   │   └── useMetadataEditor.ts # Metadata editing functionality
  
│   ├── lib/                     # Core utilities and API
│   │   ├── api/                 # API layer
│   │   │   ├── auth.ts          # Authentication management with WIB timezone
│   │   │   ├── client.ts        # HTTP client with robust URL handling
│   │   │   ├── qs.ts            # JSON:API query builder
│   │   │   ├── spatialFeature.ts # Spatial Feature API with pagination
│   │   │   ├── spatialGeneric.ts # Generic spatial data API
│   │   │   └── transformers.ts  # Data transformation utilities
│   │   ├── geo/                 # Geospatial utilities
│   │   │   └── simpleWKTConverter.ts # Simplified WKT to OpenLayers conversion
│   │   ├── config.ts            # Configuration constants
│   │   └── exportTest.ts        # Export functionality testing utilities
  
│   ├── styles/                  # CSS styles
│   │   └── ui.css
  
│   ├── types/                   # TypeScript type definitions
│   │   └── shp-write.d.ts       # Shapefile writing types
  
│   ├── assets/                  # Static assets
│   │   └── react.svg
  
│   ├── App.tsx                  # Root application component
│   ├── main.tsx                 # Application entry point
│   └── vite-env.d.ts            # Vite environment types

├── .env.example                 # Environment variables template
├── .env.production              # Production environment variables
├── .gitignore                   # Git ignore file
├── .dockerignore                # Docker ignore file
├── API_401_SOLUTION.md          # API authentication troubleshooting guide
├── docker-compose.yml           # Docker Compose configuration
├── Dockerfile                   # Multi-stage Docker build configuration
├── DOCKER_DEPLOYMENT.md         # Docker deployment guide
├── eslint.config.js             # ESLint configuration
├── FINAL_SOLUTION.md            # Final solution documentation
├── index.html                   # HTML entry point
├── nginx.conf                   # Nginx configuration for Docker
├── package.json                 # NPM package configuration
├── package-lock.json            # NPM lock file
├── preview-server.cjs           # Express preview server with proxy
├── tsconfig.app.json            # TypeScript app configuration
├── tsconfig.json                # TypeScript base configuration
├── tsconfig.node.json           # TypeScript Node configuration
├── vite.config.ts               # Vite configuration with environment support
├── PROJECT_CONTEXT.md           # Project context documentation
└── PROJECT_STRUCTURE.md         # This documentation file
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
│  │   auth.ts   │    │transformers │    │simpleWKTConv│     │
│  │             │    │    .ts      │    │    erter.ts  │     │
│  │ • login()   │    │ • feature   │    │ • Direct    │     │
│  │ • logout()  │    │   transform │    │   WKT parse │     │
│  │ • token     │    │ • attribute │    │ • Geometry  │     │
│  │   management│    │   extraction│    │   handling  │     │
│  │ • refresh   │    │ • validation│    │ • Feature   │     │
│  │ • WIB       │    │ • QGIS      │    │   creation  │     │
│  │   timezone  │    │   export    │    │             │     │
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
    │   ├── DrawingFormModal.tsx
    │   ├── ExportModal.tsx
    │   ├── FocusCard.tsx (With metadata editing)
    │   ├── LayerLoadModal.tsx (Enhanced with hierarchical grouping)
    │   ├── TranslateFeatureModal.tsx
    │   ├── TranslateLayerModal.tsx
    │   └── VertexEditingModal.tsx
    │
    ├── API Components
    │   ├── ApiLoadPanel.tsx
    │   └── api/SmartGovLoader.tsx (Simplified interface)
    │
    ├── Toolbar Components
    │   ├── DrawingToolbar.tsx
    │   └── VertexEditingToolbar.tsx
    │
    └── Dev Components (DEV only)
        └── ApiDebugger.tsx (Enhanced debugging)
```

## Data Flow

```
User Interaction
       │
       ▼
Component Event (TaxMap.tsx/SmartGovLoader.tsx)
       │
       ▼
Authentication Check (auth.ts)
       │
       ▼
API Call (client.ts)
       │
       ▼
Query Builder (qs.ts)
       │
       ▼
HTTP Request with JSON:API params + Bearer Token
       │
       ▼
Backend Response (SmartGov Framework)
       │
       ▼
Data Transformation (transformers.ts)
       │
       ▼
WKT Conversion (simpleWKTConverter.ts)
       │
       ▼
State Update (useMapStore/useLayersStore)
       │
       ▼
UI Re-render (OpenLayers + React)
```

## JSON:API Implementation Details

### Query Parameters
The implementation supports standardized JSON:API parameters:

- `page[number]`: Page number for pagination
- `page[size]`: Number of items per page (default: 50)
- `include[]`: Related resources to include (default: ['attribute'])
- `filter[]`: Filtering conditions (e.g., ['status|eq|1', 'spatialFeature.type|eq|20000001'])


### Data Transformation Flow
```typescript
SpatialFeature (API Response)
    │
    ▼
transformSpatialFeatures() → TransformedFeature[]
    │
    ▼
extractAttribute() → Extract geometry, name, type, refWilayah
    │
    ▼
simpleWKTConverter.wktToFeature() → OpenLayers Feature
    │
    ▼
addApiLayer() → Vector Layer on Map (with QGIS-compatible properties)
```

### Type Safety
- `SpatialAttribute`: Attribute type definition
- `SpatialFeature`: Feature type definition with attribute array
- `SpatialListResponse`: Paginated response type
- `ListGenericParams`: Query parameters type
- `TransformedFeature`: Normalized feature type

## Development Tools

The project includes comprehensive development tools:

### 1. ApiDebugger.tsx
- **Authentication Testing**: Login/logout functionality with WIB timezone
- **API Connectivity Tests**: Comprehensive endpoint testing
- **Data Transformation Testing**: Validate transformer functions
- **WKT Conversion Testing**: Test geometry conversion
- **Real-time Logging**: Debug logs with different levels
- **Network Inspection**: Request/response analysis
- **State Synchronization Testing**: Authentication state monitoring

### 2. SmartGovLoader.tsx
- **Streamlined Interface**: Clean UI for API data discovery
- **Layer Discovery**: Automatic detection of available layer types
- **WIB Timezone Display**: Token expiration in local timezone
- **Authentication Management**: Built-in login/logout functionality
- **Auto-Login**: Seamless authentication on component mount
- **Simplified Functionality**: Removed loading capabilities, focuses on discovery

### 3. ApiLoadPanel.tsx
- **Advanced Filtering**: Filter by type code and name patterns
- **Pagination Control**: Navigate through large datasets
- **Preview Table**: View results before loading as layers
- **Direct Integration**: Load filtered results as map layers

### 4. LayerLoadModal.tsx
- **Hierarchical Grouping**: Features organized by type and refWilayah
- **Enhanced UI**: Improved scrollbar visibility and responsive design
- **Authentication Integration**: Auto-login when accessing API tab
- **State Synchronization**: Real-time authentication status updates
- **Progress Tracking**: Loading progress with detailed status messages

## Key Features

### JSON:API Integration
- Standardized query parameter handling
- Efficient pagination with automatic page iteration
- Complex filtering with operator support
- Relationship inclusion handling
- Full TypeScript support
- SmartGov Framework compatibility

### HTTP Client Features
- Robust URL joining with base path handling
- Automatic authentication token management
- Proper error handling with status codes
- Support for both JSON and text responses
- Development/production environment configuration
- 401 error recovery with state synchronization

### Geospatial Processing
- Simplified WKT to OpenLayers feature conversion
- Direct geometry handling (no unnecessary sanitization)
- Coordinate system transformations
- Property preservation during conversion
- Batch processing capabilities
- QGIS compatibility optimizations

### Data Transformation
- Attribute extraction from complex API responses
- Feature normalization and validation
- Type-based grouping and filtering
- Statistics and summary generation
- Error handling and recovery
- QGIS export optimization

### Authentication System
- **WIB Timezone Support**: All timestamps in Indonesia Western Time
- **Auto-Login**: Seamless authentication on app restart
- **State Synchronization**: Real-time updates across components
- **Token Management**: Proper expiration handling and refresh
- **Request-Token Endpoint**: Uses `/api/auth/request-token`
- **Error Recovery**: Comprehensive 401 error handling

### Development Experience
- Hot module replacement with Vite
- TypeScript for type safety
- ESLint for code quality
- Comprehensive debugging tools
- Environment-specific configuration
- API testing framework
- Unused variable cleanup and code optimization

## API Configuration

### Environment Variables
```bash
# Development
VITE_API_BASE_URL=http://localhost:3000/api
VITE_ENABLE_API_DEBUGGING=true
VITE_DEFAULT_AUTH_USER=sa
VITE_DEFAULT_AUTH_PASSWORD=pass@word1

# Production
VITE_API_BASE_URL=https://retfw.smartgov.id/framework
VITE_ENABLE_API_DEBUGGING=false
```

### Development Environment
- **Base URL**: `/api` (proxied via Vite)
- **Authentication**: `/api/auth/login`
- **Request Token**: `/api/auth/request-token`
- **Spatial Features**: `/api/spatial-feature`

### Production Environment
- **Base URL**: `https://retfw.smartgov.id/framework`
- **Authentication**: `/framework/auth/login`
- **Request Token**: `/framework/auth/request-token`
- **Spatial Features**: `/framework/spatial-feature`

### Default Credentials
- **Username**: `sa`
- **Password**: `pass@word1`

## Component Enhancements

### FocusCard.tsx Improvements
- **Metadata Editing**: Comprehensive attribute editing interface
- **Selective Display**: Shows only essential attributes (Nama wilayah, ID wilayah)
- **Dynamic Attributes**: Allows users to add custom metadata
- **Code Cleanup**: Removed unused functions and variables
- **QGIS Compatibility**: Optimized attribute structure for export

### LayerLoadModal.tsx Enhancements
- **Hierarchical Display**: Features organized by type and refWilayah
- **Improved Scrolling**: Enhanced scrollbar visibility and overflow handling
- **Authentication Integration**: Auto-login and state synchronization
- **Simplified Selection**: Removed duplicate functionality
- **Responsive Design**: Better viewport-based sizing

### SmartGovLoader.tsx Simplification
- **Discovery Focus**: Removed loading capabilities, focuses on layer discovery
- **Clean UI**: Streamlined interface without duplicate buttons
- **WIB Timezone**: Token expiration display in local timezone
- **Auto-Login**: Seamless authentication on component mount
- **Code Optimization**: Removed unused imports and variables

## Documentation Guides

### PROJECT_CONTEXT.md
- Complete project overview
- Technology stack details
- API architecture explanation
- Development setup instructions
- Recent major updates
- Note: Other documentation files have been removed as part of project cleanup

## File Naming Conventions

- **Components**: PascalCase (e.g., `ExportModal.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useLayersStore.ts`)
- **Utilities**: camelCase (e.g., `client.ts`)
- **Types**: camelCase with descriptive names (e.g., `shp-write.d.ts`)
- **Features**: camelCase (e.g., `loadFromApi.ts`)
- **Documentation**: UPPERCASE_SNAKE_CASE (e.g., `API_DEBUGGING_GUIDE.md`)

## Code Quality Standards

- **TypeScript Strict Mode**: Enabled for type safety
- **ESLint Configuration**: Comprehensive code quality rules
- **Unused Variable Cleanup**: Regular removal of unused code
- **Component Optimization**: Performance-focused development
- **Error Handling**: Comprehensive error management
- **Documentation**: Up-to-date documentation for all features

## Recent Architectural Changes

### WKT Converter Simplification
- **Before**: Complex `wktConverter.ts` with extensive sanitization
- **After**: Simplified `simpleWKTConverter.ts` with direct OpenLayers conversion
- **Reasoning**: API provides well-formatted WKT, eliminating need for complex processing

### Authentication System Overhaul
- **WIB Timezone**: All timestamps now display in Indonesia Western Time
- **State Synchronization**: Real-time authentication updates across all components
- **Request-Token Endpoint**: Updated to use `/api/auth/request-token`
- **Auto-Login**: Improved seamless authentication experience

### UI/UX Improvements
- **LayerLoadModal**: Enhanced with hierarchical grouping and better scrolling
- **SmartGovLoader**: Simplified interface focusing on discovery
- **FocusCard**: Improved metadata editing with selective attribute display
- **Navigation**: Fixed routing issues and modal positioning

### Code Quality Initiatives
- **Unused Variable Removal**: Comprehensive cleanup across all components
- **Import Optimization**: Removed unused imports and exports
- **TypeScript Compliance**: Fixed all TypeScript warnings
- **Bundle Size Optimization**: Removed dead code and unused functions

## Deployment Architecture

### Docker Deployment (Production)
```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Container                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Nginx     │    │   React     │    │   Static    │     │
│  │  Reverse    │    │    SPA      │    │   Assets    │     │
│  │   Proxy     │    │             │    │             │     │
│  │             │    │             │    │             │     │
│  │ • API Proxy │    │ • OpenLayers│    │ • JS/CSS    │     │
│  │ • CORS      │    │ • UI       │    │ • Images    │     │
│  │ • Security  │    │ • State     │    │ • Fonts     │     │
│  │ • Gzip      │    │ • Auth      │    │             │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              External API (SmartGov)                    │ │
│  │         https://retfw.smartgov.id/framework            │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Preview Server (Development/Testing)
```
┌─────────────────────────────────────────────────────────────┐
│                Express Preview Server                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Express   │    │   React     │    │   Static    │     │
│  │    Proxy    │    │    SPA      │    │   Assets    │     │
│  │             │    │             │    │             │     │
│  │ • API Proxy │    │ • OpenLayers│    │ • JS/CSS    │     │
│  │ • CORS      │    │ • UI       │    │ • Images    │     │
│  │ • SPA Route │    │ • State     │    │ • Fonts     │     │
│  │ • Headers   │    │ • Auth      │    │             │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              External API (SmartGov)                    │ │
│  │         https://retfw.smartgov.id/framework            │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Files

### Docker Configuration
- **Dockerfile**: Multi-stage build with Node.js builder and Nginx production
- **docker-compose.yml**: Container orchestration with health checks
- **nginx.conf**: Production-ready Nginx configuration with reverse proxy
- **.dockerignore**: Files excluded from Docker build context

### Preview Server
- **preview-server.cjs**: Express server with http-proxy-middleware
- Handles API proxying, CORS, and SPA routing for preview builds

### Documentation
- **API_401_SOLUTION.md**: Comprehensive troubleshooting guide for 401 errors
- **DOCKER_DEPLOYMENT.md**: Complete Docker deployment guide
- **FINAL_SOLUTION.md**: Summary of solutions for authentication issues

## Environment Configuration

### Development Environment (.env.example)
```bash
VITE_API_BASE_URL=/api
VITE_API_PROXY_URL=/api
VITE_NODE_ENV=development
VITE_APP_TITLE=Tax Map React
VITE_PROXY_TARGET=https://retfw.smartgov.id
VITE_PROXY_PATH=/framework
VITE_ENABLE_API_DEBUG=true
VITE_ENABLE_FEATURE_GROUPS=true
VITE_AUTH_AUTO_LOGIN=true
VITE_AUTH_REFRESH_ENABLED=true
VITE_AUTH_DEFAULT_USER=sa
VITE_AUTH_DEFAULT_PASS=pass@word1
```

### Production Environment (.env.production)
```bash
VITE_API_BASE_URL=/api
VITE_API_PROXY_URL=/api
VITE_NODE_ENV=production
VITE_APP_TITLE=Tax Map React
VITE_PROXY_TARGET=https://retfw.smartgov.id
VITE_PROXY_PATH=/framework
VITE_ENABLE_API_DEBUG=false
VITE_ENABLE_FEATURE_GROUPS=true
VITE_AUTH_AUTO_LOGIN=true
VITE_AUTH_REFRESH_ENABLED=true
```

## Package Scripts

### Development
```json
{
  "dev": "vite",
  "lint": "eslint .",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "preview:proxy": "node preview-server.cjs"
}
```

### Docker Commands
```bash
# Build and start
docker-compose up -d

# Rebuild with changes
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop container
docker-compose down
```

## API Proxy Configuration

### Development (Vite)
- Proxy: `/api/*` → `https://retfw.smartgov.id/framework/*`
- Headers: Origin, Referer, Accept
- CORS: Handled by Vite dev server

### Production (Nginx)
- Proxy: `/api/*` → `https://retfw.smartgov.id/framework/*`
- Headers: Comprehensive CORS and security headers
- SSL: Upstream SSL verification
- Performance: Gzip compression and caching

### Preview (Express)
- Proxy: `/api/*` → `https://retfw.smartgov.id/framework/*`
- Headers: CORS headers for all requests
- Preflight: OPTIONS request handling
- SPA: Fallback to index.html for client-side routing

---

**Last Updated**: November 2025
**Architecture Version**: 2.1
**Framework**: React 19.1.1 with TypeScript
**Authentication**: Enhanced with WIB timezone and state synchronization
**Spatial Features**: Complete API integration with hierarchical grouping
**Deployment**: Docker with Nginx and Express preview server
**Code Quality**: Optimized with comprehensive cleanup and performance improvements