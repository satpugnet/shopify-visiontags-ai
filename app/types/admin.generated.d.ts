/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types.d.ts';

export type CreateSubscriptionMutationVariables = AdminTypes.Exact<{
  name: AdminTypes.Scalars['String']['input'];
  lineItems: Array<AdminTypes.AppSubscriptionLineItemInput> | AdminTypes.AppSubscriptionLineItemInput;
  returnUrl: AdminTypes.Scalars['URL']['input'];
}>;


export type CreateSubscriptionMutation = { appSubscriptionCreate?: AdminTypes.Maybe<(
    Pick<AdminTypes.AppSubscriptionCreatePayload, 'confirmationUrl'>
    & { appSubscription?: AdminTypes.Maybe<Pick<AdminTypes.AppSubscription, 'id'>>, userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }
  )> };

export type GetActiveSubscriptionQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type GetActiveSubscriptionQuery = { appInstallation?: AdminTypes.Maybe<{ activeSubscriptions: Array<Pick<AdminTypes.AppSubscription, 'id' | 'status'>> }> };

export type MetafieldsSetMutationVariables = AdminTypes.Exact<{
  metafields: Array<AdminTypes.MetafieldsSetInput> | AdminTypes.MetafieldsSetInput;
}>;


export type MetafieldsSetMutation = { metafieldsSet?: AdminTypes.Maybe<{ metafields?: AdminTypes.Maybe<Array<Pick<AdminTypes.Metafield, 'id' | 'namespace' | 'key' | 'value'>>>, userErrors: Array<Pick<AdminTypes.MetafieldsSetUserError, 'field' | 'message' | 'code'>> }> };

export type GetProductMetafieldsQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type GetProductMetafieldsQuery = { product?: AdminTypes.Maybe<{ metafields: { edges: Array<{ node: Pick<AdminTypes.Metafield, 'namespace' | 'key' | 'value'> }> } }> };

export type GetProductsQueryVariables = AdminTypes.Exact<{
  first: AdminTypes.Scalars['Int']['input'];
  after?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type GetProductsQuery = { products: { edges: Array<(
      Pick<AdminTypes.ProductEdge, 'cursor'>
      & { node: (
        Pick<AdminTypes.Product, 'id' | 'title' | 'productType' | 'tags'>
        & { featuredImage?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url'>>, category?: AdminTypes.Maybe<Pick<AdminTypes.TaxonomyCategory, 'name'>> }
      ) }
    )>, pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage'> } };

export type GetProductQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type GetProductQuery = { product?: AdminTypes.Maybe<(
    Pick<AdminTypes.Product, 'id' | 'title' | 'productType' | 'tags'>
    & { featuredImage?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url'>>, category?: AdminTypes.Maybe<Pick<AdminTypes.TaxonomyCategory, 'name'>> }
  )> };

export type ProductUpdateMutationVariables = AdminTypes.Exact<{
  product: AdminTypes.ProductUpdateInput;
}>;


export type ProductUpdateMutation = { productUpdate?: AdminTypes.Maybe<{ product?: AdminTypes.Maybe<Pick<AdminTypes.Product, 'id' | 'tags'>>, userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

export type CountProductsQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type CountProductsQuery = { productsCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count'>> };

export type GetCollectionProductsQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
  first: AdminTypes.Scalars['Int']['input'];
  after?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type GetCollectionProductsQuery = { collection?: AdminTypes.Maybe<{ products: { edges: Array<(
        Pick<AdminTypes.ProductEdge, 'cursor'>
        & { node: (
          Pick<AdminTypes.Product, 'id' | 'title' | 'productType' | 'tags'>
          & { featuredImage?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url'>>, category?: AdminTypes.Maybe<Pick<AdminTypes.TaxonomyCategory, 'name'>> }
        ) }
      )>, pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage'> } }> };

export type GetProductMediaQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type GetProductMediaQuery = { product?: AdminTypes.Maybe<{ media: { nodes: Array<Pick<AdminTypes.ExternalVideo, 'id' | 'mediaContentType' | 'alt'> | Pick<AdminTypes.MediaImage, 'id' | 'mediaContentType' | 'alt'> | Pick<AdminTypes.Model3d, 'id' | 'mediaContentType' | 'alt'> | Pick<AdminTypes.Video, 'id' | 'mediaContentType' | 'alt'>> } }> };

export type ProductUpdateMediaMutationVariables = AdminTypes.Exact<{
  productId: AdminTypes.Scalars['ID']['input'];
  media: Array<AdminTypes.UpdateMediaInput> | AdminTypes.UpdateMediaInput;
}>;


export type ProductUpdateMediaMutation = { productUpdateMedia?: AdminTypes.Maybe<{ media?: AdminTypes.Maybe<Array<Pick<AdminTypes.ExternalVideo, 'alt'> | Pick<AdminTypes.MediaImage, 'alt'> | Pick<AdminTypes.Model3d, 'alt'> | Pick<AdminTypes.Video, 'alt'>>>, mediaUserErrors: Array<Pick<AdminTypes.MediaUserError, 'field' | 'message'>> }> };

interface GeneratedQueryTypes {
  "#graphql\n      query getActiveSubscription {\n        appInstallation {\n          activeSubscriptions {\n            id\n            status\n          }\n        }\n      }": {return: GetActiveSubscriptionQuery, variables: GetActiveSubscriptionQueryVariables},
  "#graphql\n      query getProductMetafields($id: ID!) {\n        product(id: $id) {\n          metafields(first: 50) {\n            edges {\n              node {\n                namespace\n                key\n                value\n              }\n            }\n          }\n        }\n      }": {return: GetProductMetafieldsQuery, variables: GetProductMetafieldsQueryVariables},
  "#graphql\n            query getProducts($first: Int!, $after: String) {\n              products(first: $first, after: $after) {\n                edges {\n                  cursor\n                  node {\n                    id\n                    title\n                    featuredImage {\n                      url\n                    }\n                    productType\n                    tags\n                    category {\n                      name\n                    }\n                  }\n                }\n                pageInfo {\n                  hasNextPage\n                }\n              }\n            }": {return: GetProductsQuery, variables: GetProductsQueryVariables},
  "#graphql\n      query getProduct($id: ID!) {\n        product(id: $id) {\n          id\n          title\n          featuredImage {\n            url\n          }\n          productType\n          tags\n          category {\n            name\n          }\n        }\n      }": {return: GetProductQuery, variables: GetProductQueryVariables},
  "#graphql\n      query countProducts {\n        productsCount {\n          count\n        }\n      }": {return: CountProductsQuery, variables: CountProductsQueryVariables},
  "#graphql\n        query getCollectionProducts($id: ID!, $first: Int!, $after: String) {\n          collection(id: $id) {\n            products(first: $first, after: $after) {\n              edges {\n                cursor\n                node {\n                  id\n                  title\n                  featuredImage {\n                    url\n                  }\n                  productType\n                  tags\n                  category {\n                    name\n                  }\n                }\n              }\n              pageInfo {\n                hasNextPage\n              }\n            }\n          }\n        }": {return: GetCollectionProductsQuery, variables: GetCollectionProductsQueryVariables},
  "#graphql\n      query getProductMedia($id: ID!) {\n        product(id: $id) {\n          media(first: 1) {\n            nodes {\n              id\n              mediaContentType\n              alt\n            }\n          }\n        }\n      }": {return: GetProductMediaQuery, variables: GetProductMediaQueryVariables},
}

interface GeneratedMutationTypes {
  "#graphql\n      mutation createSubscription($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!) {\n        appSubscriptionCreate(\n          name: $name\n          returnUrl: $returnUrl\n          lineItems: $lineItems\n        ) {\n          appSubscription {\n            id\n          }\n          confirmationUrl\n          userErrors {\n            field\n            message\n          }\n        }\n      }": {return: CreateSubscriptionMutation, variables: CreateSubscriptionMutationVariables},
  "#graphql\n      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {\n        metafieldsSet(metafields: $metafields) {\n          metafields {\n            id\n            namespace\n            key\n            value\n          }\n          userErrors {\n            field\n            message\n            code\n          }\n        }\n      }": {return: MetafieldsSetMutation, variables: MetafieldsSetMutationVariables},
  "#graphql\n      mutation productUpdate($product: ProductUpdateInput!) {\n        productUpdate(product: $product) {\n          product {\n            id\n            tags\n          }\n          userErrors {\n            field\n            message\n          }\n        }\n      }": {return: ProductUpdateMutation, variables: ProductUpdateMutationVariables},
  "#graphql\n      mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {\n        productUpdateMedia(productId: $productId, media: $media) {\n          media {\n            alt\n          }\n          mediaUserErrors {\n            field\n            message\n          }\n        }\n      }": {return: ProductUpdateMediaMutation, variables: ProductUpdateMediaMutationVariables},
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
