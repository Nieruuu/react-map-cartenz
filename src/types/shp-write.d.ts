declare module "shp-write" {
  const shpWrite: {
    zip: (featureCollection: any, options?: any) => any;
    write?: (...args: any[]) => any;
    download?: (...args: any[]) => any;
  };

  export = shpWrite;
}
