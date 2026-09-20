import SwaggerParser from '@apidevtools/swagger-parser';

const api = await SwaggerParser.validate('docs/openapi.yaml');
console.log(`Validated ${api.info.title}: ${Object.keys(api.paths).length} paths.`);
