---
title: Transient Analysis - timestep control
description: based on ngspice46
tags: [source code analysis]
---

以下以[电子电路的计算机辅助设计方法](https://discover.lib.tsinghua.edu.cn/entrance/searchEntrance/resourceDetail?id=86THU_ALMA_CN21360098260003966&search_scope=default_scope&title=电子电路的计算机辅助分析与设计方法%20%3D%20%3D%20Computer%20aided%20analysis%20and%20design%20methods%20of%20electric%20circuits&version=&frbrgroupid=1503229263&context=L&adaptor=Local%20Search%20Engine&query=any,contains,电子电路的计算机辅助分析与设计方法&isFrbr=true#location)的设计为算法实现参考

## Part 1: TA 主循环 DCtran(src/spicelib/analysis/dctran.c)  

- 失败缩步  

  ```cpp  
    if(converged != 0) {
        ... /* 回退至上一次已接受结果 */
        ckt->CKTdelta = ckt->CKTdelta/8;
        ... /* 首个时间点的启动处理 */
        ckt->CKTorder = 1;  /* 改用一阶方法(BE)重试 */
    }
  ```  

  NR 迭代不收敛的缩步策略与参考的标准实现一致，均为$h_n = h_n/8$。  

- LTE 后验校正

  ```cpp  
    /* converged */
    ... /* 首次迭代不做 LTE 校验 */
    newDelta = ckt->CKTdelta;
    error = ckt->CKTtrunc(ckt, &newDelta);
    ... /* 错误处理 */
    if(newDelta > .9 * ckt->CKTdelta){
        ...
    }else{
        ... /* 拒绝该步，回退至上一接受步 */
        ckt->CKTdelta = newDelta; /* 使用建议步长重新计算 */
    }
  ```  

  $h_n \le 0.9 \times h_n^p$ 时， 拒绝该步。

- LTE 先验估计

  对于通过 LTE 校验的时间步，会在允许的情况下尝试提高积分方法阶数（仅限于从一阶提升至二阶）  
  因此，尽管代码中内置 Gear 1-6 阶公式，实际上TA中仅只会采用一阶BE以及二阶的梯形/BDF。

  ```cpp  
  /* conveged && LTE passed */
  if ((ckt->CKTorder == 1) && (ckt->CKTmaxOrder > 1)) {
    newdelta = ckt->CKTdelta;
    ckt->CKTorder = 2;
    error = CKTtrunc(ckt, &newdelta);
    ... /* 错误处理 */
    if (newdelta <= 1.05 * ckt->CKTdelta) {
        /* 采取二阶方法带来的步长增益不大，继续使用BE */
        ckt->CKTorder = 1;
    }
  }
  ckt->CKTdelta = newDelta;
  ...
  goto nexttime;    /* 开始下一个步进 */
  ```  

## Part 2: LTE estimation 的具体实现

- 调用链

  ```text
  DCtran:
      -> CKTtrunc: 遍历所有存在实例的且绑定有DEVtrunc函数指针的器件类型
          -> CAPtrunc/INDtrunc/... 
              -> CKTterr 与器件专门限制
      -> 建议步长 = min(2 * 传入步长， 各器件限制步长)
  ```

  因此，步长缩放因子至多为2。  
  
- CKTterr(src/spicelib/analysis/cktterr.c)的具体实现
  
  ```cpp
  void CKTterr(int qcap, CKTcircuit *ckt, double *timeStep){
    ... /* Initialize */

    /* Calculate tol = max(voltol, chargetol) */
    volttol = ckt->CKTabstol + ckt->CKTreltol * 
            MAX( fabs(ckt->CKTstate0[ccap]), fabs(ckt->CKTstate1[ccap]));
            
    chargetol = MAX(fabs(ckt->CKTstate0[qcap]),fabs(ckt->CKTstate1[qcap]));
    chargetol = ckt->CKTreltol * MAX(chargetol,ckt->CKTchgtol)/ckt->CKTdelta;
    tol = MAX(volttol,chargetol);
    /* Calculate tol = max(voltol, chargetol) */

    /* 差分 */
    for(i=ckt->CKTorder+1;i>=0;i--) {
        diff[i] = ckt->CKTstates[i][qcap];
    }
    for(i=0 ; i <= ckt->CKTorder ; i++) {
        deltmp[i] = ckt->CKTdeltaOld[i];
    }
    j = ckt->CKTorder;
    for (;;) {
        for(i=0;i <= j;i++) {
            diff[i] = (diff[i] - diff[i+1])/deltmp[i];
        }
        if (--j < 0) break;
        for(i=0;i <= j;i++) {
            deltmp[i] = deltmp[i+1] + ckt->CKTdeltaOld[i];
        }
    }
    /* 差分 */

    ... /* choose coefficient according to the method used */

    del = ckt->CKTtrtol * tol/MAX(ckt->CKTabstol,factor * fabs(diff[0]));
    if(ckt->CKTorder == 2) {
        del = sqrt(del);
    }else if(ckt->CKTorder > 2){...} // not reached

    *timeStep = MIN(*timeStep,del);
  }
  ```

  **此处存在与标准LTE算法的差异。**  

  - n+1阶差分
    $$f[x_0,x_1,x_2,...,x_n] = \frac{f^{(n)}(\xi)}{n!}$$
    此处并未补偿阶乘系数 $n!$

  - 标准 LTE k阶应当开(k+1)次方
    $$
        h_{n+1} = \alpha h_n \\
        \lvert E_{T,n+1} \rvert \approx \gamma f^{(k+1)}(\xi) h_{n+1}^{k+1}\approx \gamma \alpha^{k+1} h_n^{k+1} f^{(k+1)}(\xi) = \alpha^{k+1} \lvert E_{T, n} \rvert \le \epsilon \\
        \alpha \le \sqrt[k+1]{\frac{\epsilon_{max}}{\lvert E_{T, n} \rvert}}
    $$
    通常取 $h_{n+1} = C \alpha h_n, C \in (0.8,0.9)$

### 关于ngspice在此采用的算法的溯源

[Overview of SPICE-like circuit simulation algorithms, 1994](https://forum.qorvo.com/uploads/short-url/7FxQ25NhphlGWXWr6dW6AT1XlW9.pdf) Page 246, formula (10) - (12)  

> SPICE disguises the foregoing problem to some extent
> by ignoring decay of local truncation error, and by using
> an error rate of complexity O($h^3$) / h = O($h^2$) to
> control the time step h.

- 用局部截断误差率作为控制指标，试图间接控制全局误差的累积。

- 由于忽略了累积误差在迭代步进过程中的缩放，对于步长的预测结果偏保守。

但是**依然无法解决导数未补偿阶乘因子**。无论采用哪种公式，都将使步长限制放得更宽。

### 后续使用 Gear 积分公式的潜在问题（默认不会触及的路径）

变步长的 Gear 积分公式根据历史步长确定积分余项系数，而在 CKTterr 函数中采用固定的静态积分余项系数表。

## Part 3: 一些与TA自适应步长相关的参数缺省值

主要定义集中在CKTnewTask(src/spicelib/analysis/cktntask.c)中完成初始化

``` cpp
    /* LTE上限估计相关 */
    tsk->TSKabstol          = 1e-12;
    tsk->TSKreltol          = 1e-3;
    tsk->TSKchgtol          = 1e-14;
    tsk->TSKvoltTol         = 1e-6;
    tsk->TSKtrtol           = 7;
    /* LTE上限估计相关 */

    /* 迭代过程控制相关 */
    tsk->TSKtranMaxIter     = 10;
    tsk->TSKintegrateMethod = TRAPEZOIDAL;
    tsk->TSKmaxOrder        = 2;
    /* 迭代过程控制相关 */
```

- 默认启用梯形法，积分法阶数上限为2
  
- 每次步进至多NR迭代10次（实际上会被覆盖为100次）
  
- 参考书籍中暂且未给出 LTE 上界的限制方式。ngspice中的实现方式与《Overview of SPICE-like circuit simulation algorithms, 1994》论文中容差构造相符。

### 代码段存在冲突

NR迭代主循环 NIiter(src/maths/ni/niiter.c)中存在代码段

```cpp
    if(maxIter < 100)
       maxIter = 100;
```

该段落会覆盖掉默认的单次步进最大迭代次数，对于难收敛步可能会造成额外的性能开销。
