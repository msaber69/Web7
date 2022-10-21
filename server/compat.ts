import { Request, Response } from 'express'
const fs = require("fs")

interface Product {
    name: string,
    image: string,
    price:  number,
    currency: string,
    extendedName: string,
    urlId: string,
    url: string,
    description: string,
    category: string,
    fiche: Object,
    compat: Compat
}

interface Compat { 
    //not well done because defined as if it would have all properties while it's not the case, but otherwise it breaks
    //and i haven't been able to find another way for it to work
    ddr: string,
    chipset: string,
    mChipset: string[],
    TDP: string,
    size: string[],
    mSize: string
}

interface BasketProduct {
    category: string,
    urlId: string
}

class Basket {
    psu?: Product = undefined; 
    ram?: Product = undefined;
    processeur?: Product = undefined;
    graphicCard?: Product = undefined;
    motherboard?: Product = undefined;
    aio?: Product = undefined;
}

async function openJsonFile(fileName:string):Promise<Product[]> {
    const raw: string = await fs.readFileSync(`./fiche_techniques/${fileName}.json`);
    return JSON.parse(raw);
}

async function getProductFromFile(category: string, urlId: string):Promise<Product> {
    const data = await openJsonFile(category);
    return data.filter(el => el.urlId == urlId)[0];
}

export async function getProducts(req: Request, res: Response){
    const data = await openJsonFile(req.body.category);
    res.status(200).json(data);
}

export async function getProduct(req: Request, res: Response){
    const product = await getProductFromFile(req.body.category, req.body.urlId);
    res.status(200).json(product);
}

async function getBasket(rawBasket: BasketProduct[]):Promise<Basket> {
    //rebuild the basket from category and urlId into Product Objects
    const basket: Basket = new Basket;
    for(const product of rawBasket){
        const temp = await getProductFromFile(product.category, product.urlId);
        const key: keyof Basket = product.category as keyof Basket;
        basket[key] = temp;
    }
    return basket;
}

function getTDP(raw: string):number {
    //there should always be ' W' at the end
    if(raw.endsWith(' W')) return  Number(raw.substring(0,raw.length-3));
    return 0;
}

function getTotalTDP(basket: Basket):number {
    let total: number = 0;
    if(basket.processeur){
        total += getTDP(basket.processeur.compat.TDP);
    }
    if(basket.graphicCard){
        total += getTDP(basket.graphicCard.compat.TDP);
    }

    return total;
}

async function checkCompat(category: string, product: Product, basket: Basket, totalTDP: number):Promise<boolean> {
    if(category == "processeurs"){
        if(basket.ram){
            if(product.compat.ddr != basket.ram.compat.ddr) return false;
        }
        if(basket.motherboard){
            if(!basket.motherboard.compat.mChipset.includes(product.compat.chipset)) return false;
        }
        if(basket.psu){
            const cpuTDP: number = getTDP(product.compat.TDP);
            const psuTDP: number = getTDP(basket.psu.compat.TDP);
            if(totalTDP + cpuTDP > psuTDP) return false;
        }
    } else if(category == "ram"){
        if(basket.processeur){
            if(product.compat.ddr != basket.processeur.compat.ddr) return false;
        }
        if(basket.motherboard){
            if(product.compat.ddr != basket.motherboard.compat.ddr) return false;
        }
    } else if(category == "motherboards"){
        if(basket.processeur){
            if(!product.compat.mChipset.includes(basket.processeur.compat.chipset)) return false;
        }
        //check size
    } else if(category == "psu"){
        const psuTDP: number = getTDP(product.compat.TDP);
        if(totalTDP > psuTDP) return false;
    } else if(category == "aio_coolers"){
        if(basket.processeur){
            const cpuTDP: number = getTDP(basket.processeur.compat.TDP);
            const aioTDP: number = getTDP(product.compat.TDP);
            if(aioTDP < cpuTDP) return false;
        }
    } else if(category == "graphic_cards"){
        if(basket.psu){
            const gpuTDP: number = getTDP(product.compat.TDP);
            const psuTDP: number = getTDP(basket.psu.compat.TDP);
            if(totalTDP + gpuTDP > psuTDP) return false;
        }
    }
    return true;
}

export async function getProductsCompat(req: Request, res: Response){
    const category = req.body.category;
    const basket = await getBasket(req.body.basket);
    const totalTDP = getTotalTDP(basket);
    const data = await openJsonFile(category);
    const products: Product[] = [];
    for(const product of data){
        if(await checkCompat(category, product, basket, totalTDP)){
            products.push(product)
        }
    }
    res.status(200).json(products);
}

export async function getProductCompat(req: Request, res: Response){
    const category = req.body.category;
    const urlId = req.body.urlId
    const basket = await getBasket(req.body.basket);
    const totalTDP = getTotalTDP(basket);
    const product = await getProductFromFile(category, urlId);

    const compatible = await checkCompat(category, product, basket, totalTDP);

    res.status(200).json(compatible);
}
