# Project Sell API Documentation

Base URL: `/api/v1/project-sell`

## Endpoints

### Public Endpoints (No Authentication Required)

#### 1. Get All Projects
```
GET /projects
```
**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 12)
- `category` (string): Filter by category (web, mobile, design, software)
- `minPrice` (number): Minimum price filter
- `maxPrice` (number): Maximum price filter
- `search` (string): Search in title, description, tags, technologies
- `sortBy` (string): Sort field (default: createdAt)
- `sortOrder` (string): asc or desc (default: desc)
- `status` (string): Filter by status (default: published)

**Response:**
```json
{
  "success": true,
  "projects": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalProjects": 48,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

#### 2. Get Featured Projects
```
GET /projects/featured
```

#### 3. Get Projects by Category
```
GET /projects/category/:category
```
**Parameters:**
- `category`: web, mobile, design, software

**Query Parameters:**
- `limit` (number): Maximum results (default: 10)

#### 4. Get Single Project
```
GET /projects/:id
```
**Parameters:**
- `id`: Project ID or slug

---

### Protected Endpoints (Authentication Required)

#### 5. Create New Project
```
POST /projects
```
**Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: multipart/form-data`

**Form Data:**
- `title` (string, required): Project title
- `description` (string, required): Project description
- `category` (string, required): web, mobile, design, software
- `price` (number, required): Project price
- `subCategory` (string): Sub-category
- `technologies` (string): Comma-separated technologies
- `duration` (string): 1week, 2weeks, 1month, 2months, 3months
- `features` (string): Comma-separated features
- `requirements` (string): Project requirements
- `status` (string): draft or published (default: draft)
- `tags` (string): Comma-separated tags
- `links` (JSON string): Object with github, demo, portfolio, documentation URLs
- `images` (files): Up to 10 image files
- `videos` (files): Up to 5 video files

**Example Links JSON:**
```json
{
  "github": "https://github.com/user/repo",
  "demo": "https://demo-url.com",
  "portfolio": "https://portfolio-url.com",
  "documentation": "https://docs-url.com"
}
```

#### 6. Get User's Projects
```
GET /my-projects
```
**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10)
- `status` (string): Filter by status (all, draft, published, sold, archived)

#### 7. Update Project
```
PUT /projects/:id
```
**Parameters:**
- `id`: Project ID

**Body:** Same as Create Project (all fields optional)

#### 8. Delete Project
```
DELETE /projects/:id
```
**Parameters:**
- `id`: Project ID

#### 9. Like/Unlike Project
```
POST /projects/:id/like
```
**Parameters:**
- `id`: Project ID

**Response:**
```json
{
  "success": true,
  "message": "Project liked",
  "isLiked": true,
  "likeCount": 5
}
```

#### 10. Add Inquiry
```
POST /projects/:id/inquiry
```
**Parameters:**
- `id`: Project ID

**Body:**
```json
{
  "message": "I'm interested in this project..."
}
```

---

## Database Schema

### ProjectSell Model Fields:

**Basic Information:**
- `title` (String, required, max: 100)
- `description` (String, required, max: 2000)
- `category` (String, required, enum: ['web', 'mobile', 'design', 'software', 'other'])
- `subCategory` (String)

**Pricing & Details:**
- `price` (Number, required, min: 1)
- `technologies` (Array of Strings)
- `duration` (String, enum: ['1week', '2weeks', '1month', '2months', '3months', 'custom'])

**Media:**
- `images` (Array of Objects): filename, originalName, path, size, mimetype, uploadedAt
- `videos` (Array of Objects): filename, originalName, path, size, mimetype, uploadedAt

**Links:**
- `links.github` (String, GitHub URL validation)
- `links.demo` (String, URL validation)
- `links.portfolio` (String, URL validation)
- `links.documentation` (String, URL validation)

**Additional:**
- `features` (Array of Strings)
- `requirements` (String, max: 1000)
- `status` (String, enum: ['draft', 'published', 'sold', 'archived'])
- `isActive` (Boolean, default: true)
- `isFeatured` (Boolean, default: false)

**User & Analytics:**
- `seller` (ObjectId, ref: 'User', required)
- `views` (Number, default: 0)
- `likes` (Array): user, likedAt
- `inquiries` (Array): user, message, inquiredAt

**SEO:**
- `tags` (Array of Strings, lowercase)
- `slug` (String, unique, auto-generated)

**Timestamps:**
- `createdAt`, `updatedAt`, `publishedAt`

---

## Usage Examples

### Frontend Integration

```javascript
// Create project
const formData = new FormData();
formData.append('title', 'Modern E-commerce Website');
formData.append('description', 'Full-featured e-commerce solution...');
formData.append('category', 'web');
formData.append('price', '500');
formData.append('technologies', 'React,Node.js,MongoDB');
formData.append('links', JSON.stringify({
  github: 'https://github.com/user/repo',
  demo: 'https://demo.com'
}));

// Add images
for (let i = 0; i < images.length; i++) {
  formData.append('images', images[i]);
}

const response = await fetch('/api/v1/project-sell/projects', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

### File Upload Limits
- **Images:** Max 10 files, 50MB per file
- **Videos:** Max 5 files, 50MB per file
- **Supported formats:** Images (jpg, png, gif, webp), Videos (mp4, avi, mov)

### Error Handling
All endpoints return consistent error format:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

### Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error
